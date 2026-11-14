"""A. Identity and goals: users, career goals, workflow runs, audit events."""

from __future__ import annotations

from typing import Optional

from .client import (DBError, delete_by_id, first, get_by_id, now_iso, pick,
                     remove_files, require, run, storage, table)
from .models import MAX_RETRIES, Modality, WorkflowState

_USER_FIELDS = {"name", "email", "auth_provider", "preferences_json", "consent_at"}
_GOAL_FIELDS = {"target_role", "location", "seniority", "learning_goal", "modality", "is_active"}
_STATES = set(WorkflowState.__args__)
_MODALITIES = set(Modality.__args__)


# ---- Users -------------------------------------------------------------------
def create_user(email: str, name: Optional[str] = None, consent: bool = True) -> dict:
    """Create a user, or return the existing one with this email."""
    email = (email or "").strip().lower()
    if "@" not in email:
        raise DBError("A valid email is required")
    existing = get_user_by_email(email)
    if existing:
        return existing
    row = {"email": email, "name": name, "consent_at": now_iso() if consent else None}
    return first(run(table("users").insert(row), "Create user"))


def get_user(user_id: str) -> Optional[dict]:
    return get_by_id("users", user_id, "user")


def get_user_by_email(email: str) -> Optional[dict]:
    email = (email or "").strip().lower()
    return first(run(table("users").select("*").eq("email", email).limit(1), "Find user"))


def list_users(limit: int = 100) -> list[dict]:
    return run(table("users").select("*").order("created_at", desc=True).limit(limit),
               "List users")


def update_user(user_id: str, **fields) -> dict:
    changes = pick(fields, _USER_FIELDS)
    if "email" in changes:
        changes["email"] = changes["email"].strip().lower()
    if not changes:
        return require(get_user(user_id), "User")
    return require(first(run(table("users").update(changes).eq("id", user_id), "Update user")),
                  "User")


def delete_user(user_id: str) -> bool:
    """Delete a user, all rows they own (cascade) and their stored files."""
    for folder in (f"resumes/{user_id}", f"exports/{user_id}"):
        try:
            files = storage().list(folder) or []
        except Exception:  # noqa: BLE001 - folder may not exist
            files = []
        remove_files(f"{folder}/{f['name']}" for f in files if f.get("name"))
    return delete_by_id("users", user_id, "user")


# ---- Career goals ------------------------------------------------------------
def create_goal(user_id: str, target_role: str, location: Optional[str] = None,
                seniority: Optional[str] = None, learning_goal: Optional[str] = None,
                modality: str = "both") -> dict:
    """Create the user's active goal; any previous goal is deactivated."""
    if not (target_role or "").strip():
        raise DBError("target_role is required")
    if modality not in _MODALITIES:
        raise DBError(f"modality must be one of {sorted(_MODALITIES)}")
    run(table("career_goals").update({"is_active": False})
        .eq("user_id", user_id).eq("is_active", True), "Deactivate goals")
    row = {"user_id": user_id, "target_role": target_role.strip(), "location": location,
           "seniority": seniority, "learning_goal": learning_goal, "modality": modality,
           "is_active": True}
    return first(run(table("career_goals").insert(row), "Create goal"))


def get_goal(goal_id: str) -> Optional[dict]:
    return get_by_id("career_goals", goal_id, "goal")


def get_active_goal(user_id: str) -> Optional[dict]:
    return first(run(table("career_goals").select("*").eq("user_id", user_id)
                     .eq("is_active", True).order("created_at", desc=True).limit(1),
                     "Get active goal"))


def list_goals(user_id: str) -> list[dict]:
    return run(table("career_goals").select("*").eq("user_id", user_id)
               .order("created_at", desc=True), "List goals")


def update_goal(goal_id: str, **fields) -> dict:
    changes = pick(fields, _GOAL_FIELDS)
    if "modality" in changes and changes["modality"] not in _MODALITIES:
        raise DBError(f"modality must be one of {sorted(_MODALITIES)}")
    return require(first(run(table("career_goals").update(changes).eq("id", goal_id),
                             "Update goal")), "Goal")


def delete_goal(goal_id: str) -> bool:
    return delete_by_id("career_goals", goal_id, "goal")


# ---- Workflow runs (P1) ------------------------------------------------------
def create_workflow(user_id: str, goal_id: Optional[str] = None) -> dict:
    row = {"user_id": user_id, "goal_id": goal_id, "state": "ONBOARDING"}
    return first(run(table("workflow_runs").insert(row), "Create workflow"))


def save_workflow_state(workflow_id: str, state: str, state_json: Optional[dict] = None,
                        next_action: Optional[str] = None) -> dict:
    if state not in _STATES:
        raise DBError(f"Unknown workflow state '{state}'")
    changes = {"state": state, "next_action": next_action}
    if state_json is not None:
        changes["state_json"] = state_json
    return require(first(run(table("workflow_runs").update(changes).eq("id", workflow_id),
                             "Save workflow state")), "Workflow")


def record_workflow_error(workflow_id: str, error: str) -> dict:
    wf = require(get_workflow(workflow_id), "Workflow")
    if wf["retry_count"] >= MAX_RETRIES:
        raise DBError(f"Retry limit of {MAX_RETRIES} reached")
    errors = (wf.get("errors_json") or []) + [{"at": now_iso(), "error": error[:300]}]
    return first(run(table("workflow_runs").update(
        {"errors_json": errors, "retry_count": wf["retry_count"] + 1}).eq("id", workflow_id),
        "Record workflow error"))


def get_workflow(workflow_id: str) -> Optional[dict]:
    return get_by_id("workflow_runs", workflow_id, "workflow")


# ---- Audit events (P1) -------------------------------------------------------
def log_event(user_id: str, event_type: str, entity_type: Optional[str] = None,
              entity_id: Optional[str] = None, detail: Optional[dict] = None) -> dict:
    """Record an event. Never put résumé text in detail."""
    row = {"user_id": user_id, "event_type": event_type, "entity_type": entity_type,
           "entity_id": entity_id, "detail_json": detail or {}}
    return first(run(table("audit_events").insert(row), "Log event"))


def list_events(user_id: str, limit: int = 100) -> list[dict]:
    return run(table("audit_events").select("*").eq("user_id", user_id)
               .order("occurred_at", desc=True).limit(limit), "List events")
