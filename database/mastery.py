"""E. Mastery and evidence: frozen rubrics, assessment attempts, verified evidence.

Integrity rules (also enforced by database triggers):
  * A frozen rubric can never change; edits create a new version.
  * Attempts may use only frozen rubrics.
  * Verified evidence comes only from a passed attempt by the same user.
"""

from __future__ import annotations

from typing import Optional

from .client import DBError, first, get_by_id, now_iso, require, run, table
from .models import AttemptOutcome, RubricCriteria, validate
from .profiles import get_latest_profile, skill_id_for

_OUTCOMES = set(AttemptOutcome.__args__)
_FINAL = {"passed", "failed", "needs_review"}


# ---- Rubrics -----------------------------------------------------------------
def create_rubric(skill: str, criteria: dict) -> dict:
    """Create the next draft version of a skill's rubric."""
    if not criteria:
        raise DBError("Rubric criteria cannot be empty")
    validate(RubricCriteria, criteria, "rubric criteria")
    skill_id = skill_id_for(skill)
    latest = first(run(table("rubric_versions").select("version").eq("skill_id", skill_id)
                       .order("version", desc=True).limit(1), "Get rubric version"))
    row = {"skill_id": skill_id, "version": (latest["version"] + 1) if latest else 1,
           "criteria_json": criteria, "approval_status": "draft"}
    return first(run(table("rubric_versions").insert(row), "Create rubric"))


def get_rubric(rubric_id: str) -> Optional[dict]:
    return get_by_id("rubric_versions", rubric_id, "rubric")


def update_rubric_draft(rubric_id: str, criteria: dict) -> dict:
    rubric = require(get_rubric(rubric_id), "Rubric")
    if rubric["approval_status"] == "frozen":
        raise DBError("This rubric is frozen; create a new version instead")
    return first(run(table("rubric_versions").update({"criteria_json": criteria,
                                                      "approval_status": "draft"})
                     .eq("id", rubric_id), "Update rubric"))


def approve_rubric(rubric_id: str) -> dict:
    """draft → reviewed"""
    rubric = require(get_rubric(rubric_id), "Rubric")
    if rubric["approval_status"] != "draft":
        raise DBError(f"Only a draft rubric can be reviewed (this one is "
                      f"{rubric['approval_status']})")
    return first(run(table("rubric_versions").update({"approval_status": "reviewed"})
                     .eq("id", rubric_id), "Approve rubric"))


def freeze_rubric(rubric_id: str) -> dict:
    """reviewed → frozen. After this the rubric is read-only."""
    rubric = require(get_rubric(rubric_id), "Rubric")
    if rubric["approval_status"] != "reviewed":
        raise DBError("Only a reviewed rubric can be frozen")
    return first(run(table("rubric_versions").update({"approval_status": "frozen",
                                                      "frozen_at": now_iso()})
                     .eq("id", rubric_id), "Freeze rubric"))


def get_frozen_rubric(skill: str) -> Optional[dict]:
    """Latest frozen rubric for a skill, or None."""
    return first(run(table("rubric_versions").select("*").eq("skill_id", skill_id_for(skill))
                     .eq("approval_status", "frozen").order("version", desc=True).limit(1),
                     "Get frozen rubric"))


def list_rubrics(skill: str) -> list[dict]:
    return run(table("rubric_versions").select("*").eq("skill_id", skill_id_for(skill))
               .order("version", desc=True), "List rubrics")


# ---- Assessment attempts -----------------------------------------------------
def start_attempt(user_id: str, rubric_id: str,
                  idempotency_key: Optional[str] = None) -> dict:
    """Start an attempt against a frozen rubric. Same key → same attempt."""
    if idempotency_key:
        existing = first(run(table("assessment_attempts").select("*")
                             .eq("idempotency_key", idempotency_key).limit(1),
                             "Find attempt"))
        if existing:
            return existing
    rubric = require(get_rubric(rubric_id), "Rubric")
    if rubric["approval_status"] != "frozen":
        raise DBError("Assessment attempts require a frozen rubric")
    row = {"user_id": user_id, "rubric_id": rubric_id, "status": "in_progress",
           "idempotency_key": idempotency_key}
    return first(run(table("assessment_attempts").insert(row), "Start attempt"))


def submit_attempt(attempt_id: str, outcome: str, quiz_results: Optional[dict] = None,
                   project_results: Optional[dict] = None,
                   score: Optional[dict] = None) -> dict:
    """Record graded results. outcome: 'passed', 'failed' or 'needs_review'.

    A repeat submit of an already graded attempt returns the first result unchanged.
    """
    if outcome not in _OUTCOMES:
        raise DBError(f"outcome must be one of {sorted(_OUTCOMES)}")
    attempt = require(get_attempt(attempt_id), "Attempt")
    if attempt["status"] in _FINAL:
        return attempt
    changes = {"status": outcome, "quiz_results_json": quiz_results or {},
               "project_results_json": project_results or {}, "score_json": score or {}}
    return first(run(table("assessment_attempts").update(changes).eq("id", attempt_id),
                     "Submit attempt"))


def get_attempt(attempt_id: str) -> Optional[dict]:
    return get_by_id("assessment_attempts", attempt_id, "attempt",
                     select="*, rubric_versions(skill_id, version)")


def list_attempts(user_id: str, skill: Optional[str] = None) -> list[dict]:
    if skill:
        q = (table("assessment_attempts").select("*, rubric_versions!inner(skill_id, version)")
             .eq("user_id", user_id).eq("rubric_versions.skill_id", skill_id_for(skill)))
    else:
        q = (table("assessment_attempts").select("*, rubric_versions(skill_id, version)")
             .eq("user_id", user_id))
    return run(q.order("created_at", desc=True), "List attempts")


# ---- Verified evidence -------------------------------------------------------
def record_verified_evidence(attempt_id: str, scope: str,
                             summary: Optional[str] = None) -> dict:
    """Turn a passed attempt into verified evidence and mark the skill 'demonstrated'.

    One evidence record per attempt; calling again returns the existing record.
    """
    attempt = require(get_attempt(attempt_id), "Attempt")
    if attempt["status"] != "passed":
        raise DBError("Verified evidence requires a passed attempt")
    existing = first(run(table("verified_skill_evidence").select("*")
                         .eq("attempt_id", attempt_id).limit(1), "Find evidence"))
    if existing:
        return existing
    skill_id = attempt["rubric_versions"]["skill_id"]
    row = {"user_id": attempt["user_id"], "skill_id": skill_id, "attempt_id": attempt_id,
           "scope": scope, "summary": summary}
    evidence = first(run(table("verified_skill_evidence").insert(row), "Record evidence"))

    profile = get_latest_profile(attempt["user_id"])
    if profile:
        run(table("candidate_skill_evidence").upsert(
            {"profile_id": profile["id"], "skill_id": skill_id, "evidence_type": "diagnostic",
             "excerpt": summary or scope, "status": "demonstrated"},
            on_conflict="profile_id,skill_id"), "Mark skill demonstrated")
    return evidence


def list_verified_evidence(user_id: str) -> list[dict]:
    return run(table("verified_skill_evidence").select("*, skills(canonical_name)")
               .eq("user_id", user_id).order("verified_at", desc=True),
               "List verified evidence")
