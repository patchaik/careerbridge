"""F. Wellbeing preferences (P1).

Kept deliberately separate: matching, grading and export code must never
import this module, and no scoring table links to it.
"""

from __future__ import annotations

from typing import Optional

from .client import first, now_iso, run, table


def set_wellbeing_preferences(user_id: str, opted_in: bool,
                              support_style: Optional[str] = None) -> dict:
    row = {"user_id": user_id, "opted_in": opted_in, "support_style": support_style}
    return first(run(table("wellbeing_preferences").upsert(row, on_conflict="user_id"),
                     "Save wellbeing preferences"))


def record_checkin(user_id: str) -> Optional[dict]:
    return first(run(table("wellbeing_preferences").update({"last_checkin_at": now_iso()})
                     .eq("user_id", user_id), "Record check-in"))


def get_wellbeing_preferences(user_id: str) -> Optional[dict]:
    return first(run(table("wellbeing_preferences").select("*").eq("user_id", user_id)
                     .limit(1), "Get wellbeing preferences"))


def delete_wellbeing_preferences(user_id: str) -> bool:
    return bool(run(table("wellbeing_preferences").delete().eq("user_id", user_id),
                    "Delete wellbeing preferences"))
