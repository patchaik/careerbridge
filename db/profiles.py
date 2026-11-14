"""B. Candidate profile: profiles, the shared skills taxonomy, skill evidence."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

from .client import (CONTENT_TYPES, DBError, delete_by_id, first, get_by_id, now_iso,
                     remove_files, require, run, signed_url, table, upload_file)
from .models import (EvidenceStatus, SkillCategory, SkillEvidenceIn, dump, validate)

_CATEGORIES = set(SkillCategory.__args__)
_STATUSES = set(EvidenceStatus.__args__)


# ---- Skills taxonomy (shared reference data) ---------------------------------
def find_skill(name_or_alias: str) -> Optional[dict]:
    """Find a skill by canonical name (any case) or by alias."""
    name = (name_or_alias or "").strip()
    if not name:
        return None
    hit = first(run(table("skills").select("*").ilike("canonical_name", name).limit(1),
                    "Find skill"))
    if hit:
        return hit
    return first(run(table("skills").select("*")
                     .filter("aliases_json", "cs", json.dumps([name.lower()])).limit(1),
                     "Find skill by alias"))


def get_or_create_skill(name: str, category: str = "technical") -> dict:
    found = find_skill(name)
    if found:
        return found
    if category not in _CATEGORIES:
        raise DBError(f"category must be one of {sorted(_CATEGORIES)}")
    row = {"canonical_name": name.strip(), "category": category}
    try:
        return first(run(table("skills").insert(row), "Create skill"))
    except DBError:
        # Another module may have created it at the same moment.
        return require(find_skill(name), "Skill")


def skill_id_for(skill: str) -> str:
    """Accept a skill name, alias or UUID and return the skill's UUID."""
    try:
        uuid.UUID(str(skill))
        return str(skill)
    except ValueError:
        return get_or_create_skill(skill)["id"]


def get_skill(skill_id: str) -> Optional[dict]:
    return get_by_id("skills", skill_id, "skill")


def list_skills(category: Optional[str] = None) -> list[dict]:
    q = table("skills").select("*").order("canonical_name")
    if category:
        q = q.eq("category", category)
    return run(q, "List skills")


def add_alias(skill_id: str, alias: str) -> dict:
    skill = require(get_skill(skill_id), "Skill")
    aliases = sorted(set((skill.get("aliases_json") or []) + [alias.strip().lower()]))
    return first(run(table("skills").update({"aliases_json": aliases}).eq("id", skill_id),
                     "Add alias"))


# ---- Profiles ----------------------------------------------------------------
def create_profile(user_id: str, source: str = "resume", parsed_text: Optional[str] = None,
                   file_bytes: Optional[bytes] = None, file_name: Optional[str] = None,
                   experience: Optional[list] = None) -> dict:
    """Create a profile. If file_bytes is given, the résumé is stored privately."""
    if source not in ("resume", "manual"):
        raise DBError("source must be 'resume' or 'manual'")
    profile_id = str(uuid.uuid4())
    file_ref = None
    if file_bytes is not None:
        ext = Path(file_name or "resume.pdf").suffix.lower()
        if ext not in (".pdf", ".docx"):
            raise DBError("Résumé must be a .pdf or .docx file")
        file_ref = upload_file(f"resumes/{user_id}/{profile_id}{ext}", file_bytes,
                               CONTENT_TYPES[ext])
    row = {"id": profile_id, "user_id": user_id, "source": source, "file_ref": file_ref,
           "parsed_text": parsed_text, "experience_json": experience or []}
    try:
        return first(run(table("candidate_profiles").insert(row), "Create profile"))
    except DBError:
        remove_files([file_ref])
        raise


def get_profile(profile_id: str) -> Optional[dict]:
    return get_by_id("candidate_profiles", profile_id, "profile")


def get_latest_profile(user_id: str) -> Optional[dict]:
    return first(run(table("candidate_profiles").select("*").eq("user_id", user_id)
                     .order("created_at", desc=True).limit(1), "Get latest profile"))


def list_profiles(user_id: str) -> list[dict]:
    return run(table("candidate_profiles").select("*").eq("user_id", user_id)
               .order("created_at", desc=True), "List profiles")


def confirm_profile(profile_id: str) -> dict:
    """Mark the profile as reviewed by the user (required before job search)."""
    return require(first(run(table("candidate_profiles").update({"confirmed_at": now_iso()})
                             .eq("id", profile_id), "Confirm profile")), "Profile")


def clear_parsed_text(profile_id: str) -> dict:
    """Privacy option: wipe the parsed résumé text but keep extracted skills."""
    return require(first(run(table("candidate_profiles").update({"parsed_text": None})
                             .eq("id", profile_id), "Clear résumé text")), "Profile")


def resume_file_url(profile_id: str, expires_in: int = 600) -> str:
    profile = require(get_profile(profile_id), "Profile")
    if not profile.get("file_ref"):
        raise DBError("This profile has no stored résumé file")
    return signed_url(profile["file_ref"], expires_in)


def delete_profile(profile_id: str) -> bool:
    profile = get_profile(profile_id)
    if not profile:
        return False
    exports = run(table("resume_versions").select("export_file_ref")
                  .eq("profile_id", profile_id), "List exports")
    remove_files([profile.get("file_ref")] + [e.get("export_file_ref") for e in exports])
    return delete_by_id("candidate_profiles", profile_id, "profile")


# ---- Skill evidence ----------------------------------------------------------
_EVIDENCE_SELECT = "*, skills(canonical_name, category)"


def add_skill_evidence(profile_id: str, skill: str, evidence_type: str,
                       excerpt: Optional[str] = None,
                       status: str = "not_established") -> dict:
    """Add or update one skill for a profile. A missing skill is 'not_established'."""
    item = dump(validate(SkillEvidenceIn, {"skill": skill, "evidence_type": evidence_type,
                                           "excerpt": excerpt, "status": status},
                         "skill evidence"))
    row = {"profile_id": profile_id, "skill_id": skill_id_for(item["skill"]),
           "evidence_type": item["evidence_type"], "excerpt": item.get("excerpt"),
           "status": item["status"]}
    return first(run(table("candidate_skill_evidence")
                     .upsert(row, on_conflict="profile_id,skill_id"), "Save skill evidence"))


def add_skill_evidence_bulk(profile_id: str, items: list[dict]) -> list[dict]:
    """Save many extracted skills at once (dicts shaped like SkillEvidenceIn)."""
    return [add_skill_evidence(profile_id, **dump(validate(SkillEvidenceIn, i,
                                                            "skill evidence")))
            for i in items]


def list_skill_evidence(profile_id: str, status: Optional[str] = None) -> list[dict]:
    q = (table("candidate_skill_evidence").select(_EVIDENCE_SELECT)
         .eq("profile_id", profile_id).order("created_at"))
    if status:
        q = q.eq("status", status)
    return run(q, "List skill evidence")


def update_skill_evidence(evidence_id: str, status: str,
                          excerpt: Optional[str] = None) -> dict:
    """User correction during profile review."""
    if status not in _STATUSES:
        raise DBError(f"status must be one of {sorted(_STATUSES)}")
    if status == "demonstrated":
        raise DBError("'demonstrated' is set only by record_verified_evidence")
    changes = {"status": status}
    if excerpt is not None:
        changes["excerpt"] = excerpt
    return require(first(run(table("candidate_skill_evidence").update(changes)
                             .eq("id", evidence_id), "Update skill evidence")),
                   "Skill evidence")


def delete_skill_evidence(evidence_id: str) -> bool:
    return delete_by_id("candidate_skill_evidence", evidence_id, "skill evidence")
