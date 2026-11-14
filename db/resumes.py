"""F. Résumé versions: drafts cite verified evidence; export needs approval."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .client import (CONTENT_TYPES, DBError, delete_by_id, first, get_by_id, now_iso,
                     remove_files, require, run, signed_url, table, upload_file)
from .models import ResumeChange, validate_all
from .profiles import get_profile


def _check_evidence(profile_id: str, changes: list[dict], evidence_ids: list[str]) -> str:
    """Every change must cite verified evidence that belongs to the profile's user."""
    profile = require(get_profile(profile_id), "Profile")
    cited = {c["evidence_id"] for c in changes}
    undeclared = cited - set(evidence_ids)
    if undeclared:
        raise DBError("Each change must cite one of the listed evidence IDs")
    if evidence_ids:
        rows = run(table("verified_skill_evidence").select("id")
                   .in_("id", list(evidence_ids)).eq("user_id", profile["user_id"]),
                   "Check evidence")
        unknown = set(evidence_ids) - {r["id"] for r in rows}
        if unknown:
            raise DBError("Résumé changes may cite only this user's verified evidence")
    return profile["user_id"]


def create_resume_draft(profile_id: str, changes: list[dict],
                        evidence_ids: list[str], base_file_ref: Optional[str] = None) -> dict:
    items = validate_all(ResumeChange, changes, "résumé change")
    _check_evidence(profile_id, items, evidence_ids)
    if base_file_ref is None:
        base_file_ref = (get_profile(profile_id) or {}).get("file_ref")
    row = {"profile_id": profile_id, "base_file_ref": base_file_ref, "changes_json": items,
           "evidence_ids_json": list(evidence_ids), "status": "draft"}
    return first(run(table("resume_versions").insert(row), "Create résumé draft"))


def get_resume_version(version_id: str) -> Optional[dict]:
    return get_by_id("resume_versions", version_id, "résumé version")


def list_resume_versions(profile_id: str) -> list[dict]:
    return run(table("resume_versions").select("*").eq("profile_id", profile_id)
               .order("created_at", desc=True), "List résumé versions")


def update_resume_draft(version_id: str, changes: list[dict],
                        evidence_ids: Optional[list[str]] = None) -> dict:
    version = require(get_resume_version(version_id), "Résumé version")
    if version["status"] != "draft":
        raise DBError("Only a draft can be edited")
    ids = list(evidence_ids if evidence_ids is not None else version["evidence_ids_json"])
    items = validate_all(ResumeChange, changes, "résumé change")
    _check_evidence(version["profile_id"], items, ids)
    return first(run(table("resume_versions").update({"changes_json": items,
                                                      "evidence_ids_json": ids})
                     .eq("id", version_id), "Update résumé draft"))


def approve_resume(version_id: str) -> dict:
    version = require(get_resume_version(version_id), "Résumé version")
    if version["status"] != "draft":
        raise DBError("Only a draft can be approved")
    return first(run(table("resume_versions").update({"status": "approved",
                                                      "approved_at": now_iso()})
                     .eq("id", version_id), "Approve résumé"))


def reject_resume(version_id: str) -> dict:
    version = require(get_resume_version(version_id), "Résumé version")
    if version["status"] not in ("draft", "approved"):
        raise DBError("Only a draft or approved version can be rejected")
    return first(run(table("resume_versions").update({"status": "rejected"})
                     .eq("id", version_id), "Reject résumé"))


def record_export(version_id: str, file_bytes: bytes, file_name: str,
                  idempotency_key: Optional[str] = None) -> dict:
    """Store an exported .docx/.pdf. Refused unless the version is approved."""
    version = require(get_resume_version(version_id), "Résumé version")
    if version["status"] == "exported":
        if idempotency_key and version.get("idempotency_key") == idempotency_key:
            return version
        raise DBError("This version was already exported")
    if version["status"] != "approved" or not version.get("approved_at"):
        raise DBError("Export requires an approved résumé version")
    ext = Path(file_name).suffix.lower()
    if ext not in (".pdf", ".docx"):
        raise DBError("Export must be a .pdf or .docx file")
    user_id = require(get_profile(version["profile_id"]), "Profile")["user_id"]
    path = upload_file(f"exports/{user_id}/{version_id}{ext}", file_bytes, CONTENT_TYPES[ext])
    try:
        return first(run(table("resume_versions").update(
            {"status": "exported", "export_file_ref": path,
             "idempotency_key": idempotency_key}).eq("id", version_id), "Record export"))
    except DBError:
        remove_files([path])
        raise


def export_url(version_id: str, expires_in: int = 600) -> str:
    version = require(get_resume_version(version_id), "Résumé version")
    if not version.get("export_file_ref"):
        raise DBError("This version has not been exported")
    return signed_url(version["export_file_ref"], expires_in)


def delete_resume_version(version_id: str) -> bool:
    version = get_resume_version(version_id)
    if not version:
        return False
    remove_files([version.get("export_file_ref")])
    return delete_by_id("resume_versions", version_id, "résumé version")
