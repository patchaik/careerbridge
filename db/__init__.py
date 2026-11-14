"""CareerBridge data layer.

Usage:
    from db import users, profiles, jobs, learning, mastery, resumes, admin, DBError

    user = users.create_user("ana@example.com", "Ana")
    goal = users.create_goal(user["id"], "Software Engineer, AI Applications")

Every function returns plain dicts/lists and raises DBError with a readable
message. No module outside db/ should write SQL or call Supabase directly.
"""

from .client import DBError
from . import admin, jobs, learning, mastery, profiles, resumes, users, wellbeing

__all__ = ["DBError", "admin", "jobs", "learning", "mastery", "profiles", "resumes",
           "users", "wellbeing"]
