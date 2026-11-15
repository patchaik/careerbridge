"""D. Learning: learning paths, verified resources, tutor sessions (P1)."""

from __future__ import annotations

import json
from typing import Optional

from .client import (DBError, delete_by_id, first, get_by_id, now_iso, require, run,
                     table)
from .models import (MAX_RESOURCES, Milestone, PathStatus, PriceType, ResourceIn,
                     SessionMode, dump, validate, validate_all)
from .profiles import skill_id_for

_PATH_STATUSES = set(PathStatus.__args__)
_PRICE_TYPES = set(PriceType.__args__)
_MODES = set(SessionMode.__args__)


# ---- Learning paths ----------------------------------------------------------
def create_path(goal_id: str, skill: str, objective: str,
                milestones: Optional[list[dict]] = None) -> dict:
    """Propose a learning path for one skill gap (status 'proposed')."""
    if not (objective or "").strip():
        raise DBError("objective is required")
    row = {"goal_id": goal_id, "skill_id": skill_id_for(skill), "objective": objective.strip(),
           "milestones_json": validate_all(Milestone, milestones or [], "milestone"),
           "status": "proposed"}
    return first(run(table("learning_paths").insert(row), "Create learning path"))


def get_path(path_id: str) -> Optional[dict]:
    return get_by_id("learning_paths", path_id, "learning path",
                     select="*, skills(canonical_name)")


def list_paths(goal_id: str, status: Optional[str] = None) -> list[dict]:
    q = (table("learning_paths").select("*, skills(canonical_name)")
         .eq("goal_id", goal_id).order("created_at"))
    if status:
        q = q.eq("status", status)
    return run(q, "List learning paths")


def update_path_status(path_id: str, status: str) -> dict:
    if status not in _PATH_STATUSES:
        raise DBError(f"status must be one of {sorted(_PATH_STATUSES)}")
    return require(first(run(table("learning_paths").update({"status": status})
                             .eq("id", path_id), "Update learning path")), "Learning path")


def update_milestones(path_id: str, milestones: list[dict]) -> dict:
    items = validate_all(Milestone, milestones, "milestone")
    return require(first(run(table("learning_paths").update({"milestones_json": items})
                             .eq("id", path_id), "Update milestones")), "Learning path")


def compare_and_set_progress(path: dict, milestones: list[dict], status: str) -> bool:
    """Atomically save flags + status only if the snapshot has not changed."""
    items = validate_all(Milestone, milestones, "milestone")
    try:
        return bool(run(table("learning_paths").update({"milestones_json": items, "status": status})
            .eq("id", path["id"]).eq("status", path["status"])
            .eq("milestones_json", json.dumps(path["milestones_json"])), "Save learning progress"))
    except DBError as exc:
        if "Server disconnected" not in str(exc):
            raise
        # The response may be lost after commit. Reload before the caller's bounded
        # retry; assigning the same flag is safe even if the first write succeeded.
        return False


def list_owned_paths(user_id: str) -> list[dict]:
    return run(table("learning_paths").select("*, career_goals!inner(user_id)")
        .eq("career_goals.user_id", user_id).order("created_at", desc=True).limit(50), "List saved plans")


def delete_path(path_id: str) -> bool:
    return delete_by_id("learning_paths", path_id, "learning path")


# ---- Learning resources (shared reference data) ------------------------------
def add_resource(skill: str, resource: dict | ResourceIn) -> dict:
    """Save a resource with a real URL. Deduplicates on skill + URL."""
    item = dump(validate(ResourceIn, resource, "learning resource"))
    row = {"skill_id": skill_id_for(skill), "title": item["title"], "url": item["url"],
           "provider": item.get("provider"), "price_type": item["price_type"],
           "modality": item.get("modality"), "level": item.get("level"),
           "concepts_json": item.get("concepts", [])}
    return first(run(table("learning_resources").upsert(row, on_conflict="skill_id,url"),
                     "Save learning resource"))


def list_resources(skill: str, price_type: Optional[str] = None,
                   limit: int = MAX_RESOURCES, verified_only: bool = False) -> list[dict]:
    """Up to 5 resources per price type. Lists are never padded to reach 5."""
    if price_type and price_type not in _PRICE_TYPES:
        raise DBError(f"price_type must be one of {sorted(_PRICE_TYPES)}")
    q = (table("learning_resources").select("*").eq("skill_id", skill_id_for(skill))
         .order("verified_at", desc=True, nullsfirst=False).limit(min(limit, MAX_RESOURCES)))
    if price_type:
        q = q.eq("price_type", price_type)
    if verified_only:
        q = q.not_.is_("verified_at", "null")
    return run(q, "List learning resources")


def mark_resource_verified(resource_id: str) -> dict:
    return require(first(run(table("learning_resources").update({"verified_at": now_iso()})
                             .eq("id", resource_id), "Verify resource")), "Resource")


def delete_resource(resource_id: str) -> bool:
    return delete_by_id("learning_resources", resource_id, "learning resource")


# ---- Tutor sessions (P1) -----------------------------------------------------
def save_session(path_id: str, milestone_id: str, mode: str, state: Optional[dict] = None,
                 hint_count: int = 0, session_id: Optional[str] = None) -> dict:
    if mode not in _MODES:
        raise DBError(f"mode must be one of {sorted(_MODES)}")
    row = {"path_id": path_id, "milestone_id": milestone_id, "mode": mode,
           "state_json": state or {}, "hint_count": hint_count}
    if session_id:
        return require(first(run(table("learning_sessions").update(row).eq("id", session_id),
                                 "Save session")), "Session")
    return first(run(table("learning_sessions").insert(row), "Create session"))


def get_session(session_id: str) -> Optional[dict]:
    return get_by_id("learning_sessions", session_id, "session")
