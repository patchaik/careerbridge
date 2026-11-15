"""Supabase-backed store for the AI backend. Calls only `database/` functions
-- no raw SQL, no direct Supabase client use outside `database/`.

Orchestrates the LangGraph agents (careerbridge/analyst.py, search_agent.py,
learning_coach.py, assessor.py) and saves their results through `database/`.
Replaces the old careerbridge/db.py (local PostgreSQL) + worker.py (separate
process). There is no background worker here: every operation below runs
synchronously, in-process, inside the FastAPI request that calls it (see
docs/INTEGRATION_NOTES.md for why that's a reasonable choice for a mock-mode
MVP). Each operation still records a `workflow_runs` row so
GET /api/workflows/{id} has something real to return and survives a restart.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Optional

from database import jobs, learning, mastery, profiles, users
from database.client import DBError

from careerbridge.analyst import analyst, resume_routing
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.career_analyst import resume_suite
from careerbridge.assessor import assessor, prepare_assessment
from careerbridge.errors import ApiError, db_error_to_api_error
from careerbridge.learning_coach import answer_question, coach, remediation
from careerbridge.mock_skills import MOCK_SKILLS
from careerbridge.search_agent import job_search_agent, resource_search_agent

MAX_REMEDIATION_ATTEMPTS = 3

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_SKILL_CATEGORY_LOOKUP = {s["name"].lower(): s["category"] for s in MOCK_SKILLS}


def db_category(agent_category: str) -> str:
    """Agents use careerbridge.schemas.Skill's "technical"/"nontechnical"; the
    database uses "technical"/"interpersonal"/"domain"."""
    return "interpersonal" if agent_category == "nontechnical" else "technical"


def guess_category_for_manual_skill(name: str) -> str:
    agent_category = _SKILL_CATEGORY_LOOKUP.get(name.strip().lower(), "technical")
    return db_category(agent_category)


def call(fn, *args, **kwargs):
    """Run a database/ call, translating DBError into an ApiError with the
    right HTTP status so route handlers don't each repeat the try/except."""
    try:
        return fn(*args, **kwargs)
    except DBError as exc:
        raise db_error_to_api_error(str(exc)) from exc


# ---- Workflow bookkeeping (see module docstring) --------------------------

_STATE_FOR_KIND = {
    "parse_resume": "ONBOARDING",
    "confirm_profile": "PROFILE_REVIEW",
    "search_jobs": "JOB_SEARCH",
    "analyze_skills": "GAP_ANALYSIS",
    "generate_path": "LEARNING",
    "approve_path": "PATH_APPROVAL",
    "start_assessment": "ASSESSING",
    "submit_assessment": "ASSESSING",
}


def record_workflow(user_id: str, goal_id: Optional[str], kind: str, status: str,
                    result: Optional[dict] = None, error: Optional[str] = None) -> str:
    wf = call(users.create_workflow, user_id, goal_id)
    state = _STATE_FOR_KIND.get(kind, "ONBOARDING")
    state_json = {"kind": kind, "status": status, "stage": status, "result": result, "error": error}
    call(users.save_workflow_state, wf["id"], state, state_json)
    return wf["id"]


# ---- In-process idempotency for confirm_profile (no DB column for it) -----
# Resets on restart; acceptable for this local MVP. Assessments and résumé
# export use database/'s own persistent idempotency_key columns instead.
_idempotency_cache: dict[str, dict] = {}


def with_idempotency(key: Optional[str], compute):
    if key and key in _idempotency_cache:
        return _idempotency_cache[key]
    result = compute()
    if key:
        _idempotency_cache[key] = result
    return result


# ---------------------------------------------------------------------------
# B. Onboarding / profile
# ---------------------------------------------------------------------------

def profile_response(profile_id: str) -> dict:
    profile = call(profiles.get_profile, profile_id)
    if not profile:
        raise ApiError(404, "not_found", "Profile not found")
    evidence = call(profiles.list_skill_evidence, profile_id)
    return {
        "id": profile["id"],
        "user_id": profile["user_id"],
        "source": profile["source"],
        "has_file": bool(profile.get("file_ref")),
        "confirmed_at": profile.get("confirmed_at"),
        "skills": [
            {
                "id": e["id"],
                "skill_id": e["skill_id"],
                "skill": (e.get("skills") or {}).get("canonical_name"),
                "category": (e.get("skills") or {}).get("category"),
                "evidence_type": e["evidence_type"],
                "status": e["status"],
                "excerpt": e.get("excerpt"),
            }
            for e in evidence
        ],
    }


def parse_resume_flow(user_id: str, file_bytes: bytes, file_name: str) -> dict:
    """Extract through the gateway, then keep the existing profile/storage mapping."""
    user = call(users.get_user, user_id)
    if not user or not user.get("consent_at"):
        raise ApiError(403, "forbidden", "Sign in and consent to résumé processing first.")
    ext = Path(file_name or "resume.pdf").suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise ApiError(422, "validation_error", "Upload a PDF or DOCX résumé.")
    wf = call(users.create_workflow, user_id)
    state = {"kind": "parse_resume", "status": "running", "stage": "extracting"}
    try:
        routing = resume_routing() if os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "llm" else None
        if routing:
            task = resume_suite()["tasks"]["profile_extract"]
            state.update(model_routing=routing, prompt_version=task["prompt_version"],
                         output_schema_version=task["output_schema_version"])
        call(users.save_workflow_state, wf["id"], "ONBOARDING", state)
        extraction = analyst.invoke({"file_type": ext, "file_data": file_bytes,
                                     "user_id": user_id, "workflow_id": wf["id"],
                                     "model_routing": routing})
        profile = call(profiles.create_profile, user_id, source="resume",
                       parsed_text=extraction["text"], file_bytes=file_bytes, file_name=file_name)
        for skill in extraction["skills"]:
            call(profiles.get_or_create_skill, skill["name"], db_category(skill["category"]))
        items = [{"skill": skill["name"], "evidence_type": "resume",
                  "excerpt": skill["evidence"], "status": "present"}
                 for skill in extraction["skills"]]
        if items:
            call(profiles.add_skill_evidence_bulk, profile["id"], items)
        state.update(status="complete", stage="complete",
                     invocation_id=extraction.get("invocation_id"),
                     result={"profile_id": profile["id"], "skills_found": len(items)})
        call(users.save_workflow_state, wf["id"], "ONBOARDING", state)
        return profile_response(profile["id"])
    except Exception as exc:
        code = exc.code if isinstance(exc, (ModelError, ApiError)) else "resume_processing_failed"
        state.update(status="failed", stage="failed", error=code)
        call(users.save_workflow_state, wf["id"], "ONBOARDING", state)
        if isinstance(exc, ApiError):
            raise
        if isinstance(exc, ModelError):
            if exc.code == "input_too_large":
                raise ApiError(413, "file_too_large", "Résumé text exceeds the model input limit. Try a shorter résumé.") from exc
            raise ApiError(503, "model_unavailable", "AI résumé extraction is unavailable. Please try again; no mock result was substituted.") from exc
        raise ApiError(422, "validation_error", "We couldn't process that résumé. Try a different PDF or DOCX file.") from exc


def parse_manual_skills_flow(user_id: str, skill_names: list[str],
                             experience_summary: Optional[str]) -> dict:
    profile = call(profiles.create_profile, user_id, source="manual", parsed_text=experience_summary)
    for name in skill_names:
        call(profiles.get_or_create_skill, name, guess_category_for_manual_skill(name))
    items = [{"skill": name, "evidence_type": "self_reported", "status": "self_reported"}
             for name in skill_names]
    if items:
        call(profiles.add_skill_evidence_bulk, profile["id"], items)
    record_workflow(user_id, None, "parse_resume", "complete",
                    result={"profile_id": profile["id"], "skills_found": len(items)})
    return profile_response(profile["id"])


def confirm_profile_flow(profile_id: str, skills_payload: list[dict],
                         remove_skill_ids: list[str], clear_resume_text: bool,
                         idempotency_key: Optional[str]) -> dict:
    def compute():
        profile = call(profiles.get_profile, profile_id)
        if not profile:
            raise ApiError(404, "not_found", "Profile not found")
        existing = call(profiles.list_skill_evidence, profile_id)
        by_skill = {row["skill_id"]: row for row in existing}
        removals = set(remove_skill_ids or [])
        if not removals <= {row["id"] for row in existing}:
            raise ApiError(404, "not_found", "Skill evidence not found for this profile")
        updates = []
        for item in skills_payload:
            status = item["status"]
            evidence_type = "resume" if status in ("present", "user_confirmed") else "self_reported"
            excerpt = item.get("excerpt")
            if evidence_type == "resume":
                skill = call(profiles.find_skill, item["skill"])
                previous = by_skill.get(skill["id"] if skill else item["skill"])
                if (not previous or previous["id"] in removals
                        or previous["evidence_type"] != "resume" or not previous.get("excerpt")):
                    raise ApiError(422, "validation_error", "This skill has no saved résumé evidence. Add it as self-reported.")
                if excerpt is not None and excerpt != previous["excerpt"]:
                    raise ApiError(422, "validation_error", "Confirmation cannot replace the original résumé excerpt.")
                # The UI confirms names/statuses, not evidence. Preserve the
                # server-owned excerpt even when the request omits it.
                excerpt = previous["excerpt"]
            updates.append((item["skill"], evidence_type, excerpt, status))
        for evidence_id in removals:
            call(profiles.delete_skill_evidence, evidence_id)
        for skill, evidence_type, excerpt, status in updates:
            call(profiles.add_skill_evidence, profile_id, skill, evidence_type,
                 excerpt=excerpt, status=status)
        call(profiles.confirm_profile, profile_id)
        if clear_resume_text:
            call(profiles.clear_parsed_text, profile_id)
        record_workflow(profile["user_id"], None, "confirm_profile", "complete",
                        result={"profile_id": profile_id})
        return profile_response(profile_id)

    return with_idempotency(idempotency_key, compute)


# ---------------------------------------------------------------------------
# C. Market evidence
# ---------------------------------------------------------------------------

def _provider_job_id(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:24]


def _map_job_posting(posting: dict) -> dict:
    reqs = call(jobs.list_requirements, posting["id"])
    return {
        "id": posting["id"],
        "provider": posting["provider"],
        "title": posting["title"],
        "company": posting.get("company"),
        "location": posting.get("location"),
        "url": posting["url"],
        "completeness": posting.get("completeness", "full"),
        "retrieved_at": posting["retrieved_at"],
        "requirements": [
            {
                "skill": (r.get("skills") or {}).get("canonical_name"),
                "importance": r["importance"],
                "excerpt": r["excerpt"],
                "confidence": r.get("confidence"),
            }
            for r in reqs
        ],
    }


def search_jobs_flow(user_id: str, goal: dict, limit: int) -> dict:
    profile = call(profiles.get_latest_profile, user_id)
    if not profile:
        raise ApiError(409, "rule_violation", "Confirm a profile before searching for jobs")
    evidence = call(profiles.list_skill_evidence, profile["id"])
    skills_for_agent = [{"name": (e.get("skills") or {}).get("canonical_name")} for e in evidence]

    try:
        agent_out = job_search_agent.invoke({
            "role": goal["target_role"], "location": goal.get("location") or "",
            "seniority": goal.get("seniority") or "", "skills": skills_for_agent,
        })["result"]
    except Exception as exc:
        record_workflow(user_id, goal["id"], "search_jobs", "failed", error=str(type(exc).__name__))
        raise ApiError(503, "provider_unavailable",
                       "The job search provider is temporarily unavailable.") from exc

    is_mock = agent_out.get("source") == "synthetic"
    # Agents label live results "keenable", which isn't in the DB's job_postings
    # provider enum (adzuna/greenhouse/cached/synthetic) -- see docs/INTEGRATION_NOTES.md.
    provider = "synthetic" if is_mock else "cached"

    posting_ids = []
    for job in agent_out["jobs"][:limit]:
        posting = call(jobs.upsert_job_posting, {
            "provider": provider, "provider_job_id": _provider_job_id(job["url"]),
            "title": job["title"], "url": job["url"], "company": job.get("employer"),
            "completeness": "full", "retrieved_at": job["retrieved_at"],
        })
        reqs = [{"skill": r["skill"],
                 "importance": r["importance"] if r["importance"] in ("required", "preferred") else "preferred",
                 "excerpt": r["excerpt"]} for r in job["requirements"]]
        if reqs:
            call(jobs.add_job_requirements, posting["id"], reqs)
        posting_ids.append(posting["id"])

    workflow_id = record_workflow(user_id, goal["id"], "search_jobs", "complete",
                                  result={"job_ids": posting_ids})
    return {
        "workflow_id": workflow_id,
        "jobs": [_map_job_posting(call(jobs.get_job, jid)) for jid in posting_ids],
        "fallback_used": False,
    }


def get_job_flow(job_id: str) -> dict:
    posting = call(jobs.get_job, job_id)
    if not posting:
        raise ApiError(404, "not_found", "Job posting not found")
    return _map_job_posting(posting)


def _map_gap_analysis(report: dict) -> dict:
    return {
        "id": report["id"],
        "goal_id": report["goal_id"],
        "profile_id": report["profile_id"],
        "existing_skills": report["existing_skills_json"],
        "market_skills": report["market_skills_json"],
        "gaps": [
            {
                "skill": g["skill"],
                "importance": g.get("importance"),
                "frequency": g.get("frequency"),
                "reason": g.get("reason"),
                "job_ids": g["job_ids"],
                "sources": [
                    {
                        "job_id": s["job_id"],
                        "title": s["title"],
                        "company": s.get("company"),
                        "url": s["url"],
                        "provider": s["provider"],
                        "excerpt": s.get("excerpt"),
                    }
                    for s in g.get("sources", [])
                ],
            }
            for g in report["gaps"]
        ],
        "created_at": report.get("created_at"),
    }


def analyze_skills_flow(user_id: str, goal_id: str, profile_id: str, job_ids: list[str]) -> dict:
    """Deterministic set comparison (no AI call) over already-persisted job
    requirements and the confirmed profile -- ports the comparison the search
    agent used to do inline, now reusable from stored data for this separate
    contract endpoint. See docs/INTEGRATION_NOTES.md for why this is split
    out from /jobs/search."""
    evidence = call(profiles.list_skill_evidence, profile_id)
    confirmed = {(e.get("skills") or {}).get("canonical_name", "").lower()
                 for e in evidence if e["status"] in ("present", "user_confirmed", "self_reported", "demonstrated")}

    market_names: set[str] = set()
    grouped: dict[str, dict] = {}
    for job_id in job_ids:
        for req in call(jobs.list_requirements, job_id):
            name = (req.get("skills") or {}).get("canonical_name")
            if not name:
                continue
            key = name.lower()
            market_names.add(name)
            g = grouped.setdefault(key, {"skill": name, "job_ids": [], "importance": req["importance"], "frequency": 0})
            g["job_ids"].append(job_id)
            g["frequency"] += 1
            if req["importance"] == "required":
                g["importance"] = "required"

    existing = sorted(n for n in market_names if n.lower() in confirmed)[:10]
    gaps = sorted((g for k, g in grouped.items() if k not in confirmed),
                 key=lambda g: (g["importance"] == "required", g["frequency"]), reverse=True)[:10]
    ranked_gaps = [{"skill": g["skill"], "job_ids": list(dict.fromkeys(g["job_ids"]))[:5],
                   "importance": g["importance"], "frequency": g["frequency"]} for g in gaps]

    analysis = call(jobs.create_gap_analysis, goal_id, profile_id, job_ids,
                    existing, sorted(market_names)[:10], ranked_gaps)
    record_workflow(user_id, goal_id, "analyze_skills", "complete", result={"analysis_id": analysis["id"]})
    return _map_gap_analysis(call(jobs.gap_report, analysis["id"]))


def get_gap_analysis_flow(analysis_id: str) -> dict:
    try:
        return _map_gap_analysis(call(jobs.gap_report, analysis_id))
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(404, "not_found", "Gap analysis not found") from exc


# ---------------------------------------------------------------------------
# D. Learning
# ---------------------------------------------------------------------------

def _map_rubric(rubric: dict, skill_name: str) -> dict:
    return {
        "id": rubric["id"],
        "skill": skill_name,
        "version": rubric["version"],
        "approval_status": rubric["approval_status"],
        "frozen_at": rubric.get("frozen_at"),
        "criteria": rubric["criteria_json"],
    }


def _map_learning_path(path: dict, rubric: Optional[dict]) -> dict:
    skill_name = (path.get("skills") or {}).get("canonical_name") or ""
    return {
        "id": path["id"],
        "goal_id": path["goal_id"],
        "skill": skill_name,
        "objective": path["objective"],
        "status": path["status"],
        "milestones": path["milestones_json"],
        "rubric": _map_rubric(rubric, skill_name) if rubric else None,
    }


def _rubric_for_path(path: dict) -> Optional[dict]:
    skill_name = (path.get("skills") or {}).get("canonical_name")
    if not skill_name:
        return None
    rubrics = call(mastery.list_rubrics, skill_name)
    return rubrics[0] if rubrics else None


def generate_path_flow(user_id: str, goal: dict, skill: str, modality: Optional[str]) -> dict:
    profile = call(profiles.get_latest_profile, user_id)
    if not profile:
        raise ApiError(409, "rule_violation", "Confirm a profile before generating a learning path")
    evidence = call(profiles.list_skill_evidence, profile["id"])
    skills_for_agent = [{"name": (e.get("skills") or {}).get("canonical_name")} for e in evidence]

    free_resources = call(learning.list_resources, skill, price_type="free")
    if not free_resources:
        # The contract's /paths/generate takes no resource_search_id, unlike the
        # old flow's separate step -- so discovery happens here. See notes.
        try:
            discovered = resource_search_agent.invoke({"skill": skill})["result"]
        except Exception as exc:
            raise ApiError(503, "provider_unavailable",
                           "Resource discovery is temporarily unavailable.") from exc
        for price_type in ("free", "paid"):
            for item in discovered.get(price_type, []):
                call(learning.add_resource, skill, {"title": item["title"], "url": item["url"],
                                                     "price_type": price_type})
        free_resources = call(learning.list_resources, skill, price_type="free")
    if not free_resources:
        raise ApiError(409, "rule_violation", "No free learning resources are available for this skill yet")

    try:
        coach_out = coach.invoke({"goal": goal["target_role"], "skill": skill,
                                  "skills": skills_for_agent, "resources": free_resources})
    except ValueError as exc:
        raise ApiError(409, "rule_violation", str(exc)) from exc

    # The coach's milestones carry explanation/exercise/resource_urls that the
    # contract's Milestone schema has no field for; /api/arena/tutor is the
    # delivery mechanism for that richer content instead. See notes.
    milestones = [{"id": f"m{i + 1}", "title": m["title"], "concepts": [], "mode": "written"}
                  for i, m in enumerate(coach_out["milestones"])]

    rubric = call(mastery.create_rubric, skill, coach_out["rubric"])
    path = call(learning.create_path, goal["id"], skill,
               coach_out["rubric"].get("learner_goal") or goal["target_role"], milestones)
    record_workflow(user_id, goal["id"], "generate_path", "complete",
                    result={"path_id": path["id"], "rubric_id": rubric["id"]})
    return _map_learning_path(call(learning.get_path, path["id"]), rubric)


def get_path_flow(path_id: str) -> dict:
    path = call(learning.get_path, path_id)
    if not path:
        raise ApiError(404, "not_found", "Learning path not found")
    return _map_learning_path(path, _rubric_for_path(path))


def approve_path_flow(path_id: str) -> dict:
    path = call(learning.get_path, path_id)
    if not path:
        raise ApiError(404, "not_found", "Learning path not found")
    if path["status"] != "proposed":
        raise ApiError(409, "rule_violation", "Only a proposed path can be approved")
    rubric = _rubric_for_path(path)
    if not rubric:
        raise ApiError(409, "rule_violation", "This path has no rubric to freeze")
    if rubric["approval_status"] == "draft":
        rubric = call(mastery.approve_rubric, rubric["id"])
    if rubric["approval_status"] == "reviewed":
        rubric = call(mastery.freeze_rubric, rubric["id"])
    path = call(learning.update_path_status, path_id, "approved")
    return _map_learning_path(call(learning.get_path, path_id), rubric)


def set_path_status_flow(path_id: str, status: str) -> dict:
    path = call(learning.update_path_status, path_id, status)
    return _map_learning_path(call(learning.get_path, path_id), _rubric_for_path(path))


def list_resources_flow(skill: str) -> dict:
    free = call(learning.list_resources, skill, price_type="free")
    paid = call(learning.list_resources, skill, price_type="paid")
    return {"skill": skill, "free": [_map_resource(r) for r in free], "paid": [_map_resource(r) for r in paid]}


def _map_resource(resource: dict) -> dict:
    return {
        "id": resource["id"], "title": resource["title"], "url": resource["url"],
        "provider": resource.get("provider"), "price_type": resource["price_type"],
        "modality": resource.get("modality"), "level": resource.get("level"),
        "concepts": resource.get("concepts_json") or [], "verified_at": resource.get("verified_at"),
    }


# ---------------------------------------------------------------------------
# Arena (tutor) -- bounded lesson response for the current milestone
# ---------------------------------------------------------------------------

def tutor_flow(path_id: str, milestone_id: str, message: str,
              session_id: Optional[str], mode: str) -> dict:
    path = call(learning.get_path, path_id)
    if not path:
        raise ApiError(404, "not_found", "Learning path not found")
    milestone = next((m for m in path["milestones_json"] if m["id"] == milestone_id), None)
    if not milestone:
        raise ApiError(404, "not_found", "Milestone not found on this path")

    reply = answer_question(path["objective"], [milestone], message)
    session = call(learning.save_session, path_id, milestone_id, mode,
                   state={"last_message": message, "last_reply": reply}, session_id=session_id)
    hint_count = session.get("hint_count", 0)
    if "hint" in message.lower():
        session = call(learning.save_session, path_id, milestone_id, mode,
                       state=session.get("state_json") or {}, hint_count=hint_count + 1,
                       session_id=session["id"])
    return {"session_id": session["id"], "reply": reply, "hint_count": session.get("hint_count", 0)}


# ---------------------------------------------------------------------------
# E. Mastery and evidence
# ---------------------------------------------------------------------------

def start_assessment_flow(user_id: str, path_id: str, idempotency_key: Optional[str]) -> dict:
    path = call(learning.get_path, path_id)
    if not path:
        raise ApiError(404, "not_found", "Learning path not found")
    if path["status"] != "approved":
        raise ApiError(409, "rule_violation", "Approve the path before starting an assessment")
    rubric = _rubric_for_path(path)
    if not rubric or rubric["approval_status"] != "frozen":
        raise ApiError(409, "rule_violation", "This path's rubric isn't frozen yet")

    attempt = call(mastery.start_attempt, user_id, rubric["id"], idempotency_key)
    existing = call(mastery.get_pending_assessment_set, attempt["id"])
    if existing is None and attempt["status"] == "in_progress":
        generated = prepare_assessment(rubric["criteria_json"])
        call(mastery.save_pending_assessment_set, attempt["id"], generated)
        existing = generated

    record_workflow(user_id, path["goal_id"], "start_assessment", "complete",
                    result={"attempt_id": attempt["id"]})
    quiz = [{"id": q["id"], "prompt": q["question"], "choices": q["options"]}
            for q in (existing or {}).get("questions", [])]
    return {
        "attempt_id": attempt["id"], "rubric_id": rubric["id"], "rubric_version": rubric["version"],
        "quiz": quiz, "project_task": (existing or {}).get("project_task", ""),
    }


def _retries_left(user_id: str, skill_name: str) -> int:
    attempts = call(mastery.list_attempts, user_id, skill=skill_name)
    failed = sum(1 for a in attempts if a["status"] == "failed")
    return max(0, MAX_REMEDIATION_ATTEMPTS - failed)


def submit_assessment_flow(user_id: str, attempt_id: str, quiz_answers: list[dict],
                           project_submission: str, idempotency_key: Optional[str]) -> dict:
    def compute():
        attempt = call(mastery.get_attempt, attempt_id)
        if not attempt:
            raise ApiError(404, "not_found", "Assessment attempt not found")
        if attempt["status"] not in ("in_progress",):
            return _map_assessment_result(attempt, None)

        pending = call(mastery.get_pending_assessment_set, attempt_id)
        if not pending:
            raise ApiError(409, "rule_violation", "This attempt has no pending assessment to grade")
        rubric = call(mastery.get_rubric, attempt["rubric_id"])

        answers = {a["question_id"]: a["answer"] for a in quiz_answers}
        submission = {"assessment_set_id": attempt_id, "answers": answers,
                      "project_response": project_submission or ""}
        graded = assessor.invoke({"rubric": rubric["criteria_json"], "assessment": pending,
                                  "submission": submission})["result"]
        if not graded["passed"]:
            graded["remediation"] = remediation(graded["failed_criteria"], rubric["criteria_json"])

        outcome = "passed" if graded["passed"] else "failed"
        updated = call(mastery.submit_attempt, attempt_id, outcome,
                       quiz_results=graded["knowledge"], project_results=graded["project"],
                       score={"passed": graded["passed"]})

        verified = None
        if outcome == "passed":
            verified = call(mastery.record_verified_evidence, attempt_id,
                            scope=graded.get("scope", ""),
                            summary="Independent assessment, graded against a frozen rubric.")

        skill_id = attempt["rubric_versions"]["skill_id"]
        retries_left = _retries_left(user_id, skill_id)
        record_workflow(user_id, None, "submit_assessment", "complete",
                        result={"attempt_id": attempt_id, "status": outcome})
        return _map_assessment_result(updated, graded, verified, retries_left)

    return with_idempotency(idempotency_key, compute)


def _map_assessment_result(attempt: dict, graded: Optional[dict], verified: Optional[dict] = None,
                           retries_left: Optional[int] = None) -> dict:
    knowledge = (graded or {}).get("knowledge") or attempt.get("quiz_results_json") or {}
    project = (graded or {}).get("project") or attempt.get("project_results_json") or []
    total = knowledge.get("total") or 1
    return {
        "attempt_id": attempt["id"],
        "status": attempt["status"],
        "quiz_score": (knowledge.get("score", 0) / total) if total else None,
        "criteria": [{"criterion": c.get("description", c.get("criterion_id", "")),
                     "met": c.get("passed", False), "comment": c.get("feedback")} for c in project],
        "remediation": [{"criterion": None, "activity": a} for a in (graded or {}).get("remediation", [])] or None,
        "retries_left": retries_left,
        "verified_evidence_id": verified["id"] if verified else None,
    }


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------

def progress_flow(user_id: str) -> dict:
    goal = call(users.get_active_goal, user_id)
    if not goal:
        raise ApiError(409, "rule_violation", "Create a goal before checking progress")
    analysis = call(jobs.get_latest_gap_analysis, goal["id"])
    paths = call(learning.list_paths, goal["id"])
    verified = call(mastery.list_verified_evidence, user_id)
    verified_names = {(v.get("skills") or {}).get("canonical_name") for v in verified}

    gaps = []
    for gap in (analysis or {}).get("ranked_gaps_json", []):
        skill_name = gap["skill"]
        path = next((p for p in paths if (p.get("skills") or {}).get("canonical_name") == skill_name), None)
        if skill_name in verified_names:
            status = "demonstrated"
        elif path and path["status"] == "approved":
            status = "assessing"
        elif path:
            status = "learning"
        else:
            status = "not_started"
        gaps.append({"skill": skill_name, "status": status, "path_id": path["id"] if path else None})

    next_action = "Review your skill gap analysis"
    if gaps:
        in_progress = next((g for g in gaps if g["status"] in ("learning", "assessing")), None)
        not_started = next((g for g in gaps if g["status"] == "not_started"), None)
        if in_progress:
            next_action = f"Continue working on {in_progress['skill']}"
        elif not_started:
            next_action = f"Start a learning path for {not_started['skill']}"
        else:
            next_action = "Review your verified skills"

    return {
        "goal": goal,
        "gaps": gaps,
        "verified_evidence": [
            {"id": v["id"], "skill": (v.get("skills") or {}).get("canonical_name"),
             "scope": v.get("scope", ""), "summary": v.get("summary"),
             "attempt_id": v.get("attempt_id"), "verified_at": v["verified_at"]}
            for v in verified
        ],
        "next_action": next_action,
    }
