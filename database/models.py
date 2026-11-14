"""Shared data shapes for the CareerBridge data layer.

These are the contract between modules: the parser, job finder, matcher,
learning and assessment code all build these objects, and database/ validates them
before saving. Allowed values match the CHECK constraints in database/schema.sql.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

# ---- Allowed values (keep in sync with database/schema.sql) ----------------------
Modality = Literal["text", "hands_on", "both"]
ProfileSource = Literal["resume", "manual"]
SkillCategory = Literal["technical", "interpersonal", "domain"]
EvidenceType = Literal["resume", "self_reported", "diagnostic"]
EvidenceStatus = Literal["present", "user_confirmed", "self_reported",
                         "not_established", "demonstrated"]
JobProvider = Literal["adzuna", "greenhouse", "cached", "synthetic"]
Completeness = Literal["full", "partial"]
Importance = Literal["required", "preferred"]
PathStatus = Literal["proposed", "approved", "in_progress", "completed", "paused"]
PriceType = Literal["free", "paid", "mixed", "unknown"]
SessionMode = Literal["written", "hands_on"]
RubricStatus = Literal["draft", "reviewed", "frozen"]
AttemptStatus = Literal["in_progress", "submitted", "passed", "failed", "needs_review"]
AttemptOutcome = Literal["passed", "failed", "needs_review"]
ResumeStatus = Literal["draft", "approved", "exported", "rejected"]
WorkflowState = Literal["ONBOARDING", "PROFILE_REVIEW", "JOB_SEARCH", "GAP_ANALYSIS",
                        "PATH_APPROVAL", "LEARNING", "ASSESSING", "REMEDIATION",
                        "EVIDENCE_VERIFIED", "RESUME_REVIEW", "EXPORT_READY"]

# ---- Limits from the spec ---------------------------------------------------
MAX_SKILLS = 10          # existing, market and gap lists
MAX_RESOURCES = 5        # per price type
MAX_JOBS = 5
MAX_RETRIES = 3


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---- B. Candidate profile ----------------------------------------------------
class SkillEvidenceIn(Strict):
    skill: str = Field(min_length=1, max_length=120)
    evidence_type: EvidenceType
    excerpt: Optional[str] = Field(default=None, max_length=1000)
    status: EvidenceStatus = "not_established"

    @field_validator("status")
    @classmethod
    def no_demonstrated(cls, v):
        if v == "demonstrated":
            raise ValueError("'demonstrated' is set only by record_verified_evidence")
        return v


# ---- C. Market evidence ------------------------------------------------------
class JobPostingIn(Strict):
    provider: JobProvider
    provider_job_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    url: HttpUrl
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    completeness: Completeness = "full"
    retrieved_at: Optional[datetime] = None


class JobRequirementIn(Strict):
    skill: str = Field(min_length=1, max_length=120)
    importance: Importance
    excerpt: str = Field(min_length=1, max_length=1000)  # every gap traces to job text
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class RankedGap(Strict):
    skill: str = Field(min_length=1)
    job_ids: list[str] = Field(min_length=1)   # which postings ask for it
    importance: Optional[Importance] = None
    frequency: Optional[int] = Field(default=None, ge=0)
    reason: Optional[str] = None


# ---- D. Learning -------------------------------------------------------------
class Milestone(Strict):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    concepts: list[str] = []
    mode: Optional[SessionMode] = None
    done: bool = False


class ResourceIn(Strict):
    title: str = Field(min_length=1)
    url: HttpUrl
    provider: Optional[str] = None
    price_type: PriceType = "unknown"
    modality: Optional[str] = None
    level: Optional[str] = None
    concepts: list[str] = []


# ---- E. Mastery --------------------------------------------------------------
class RubricCriteria(BaseModel):
    """Rubric content is skill-specific; only a non-empty object is required."""
    model_config = ConfigDict(extra="allow")


# ---- F. Résumé ---------------------------------------------------------------
class ResumeChange(Strict):
    section: str = Field(min_length=1)
    after: str = Field(min_length=1)
    before: Optional[str] = None
    evidence_id: str = Field(min_length=1)   # must be a verified evidence ID


def dump(model: BaseModel) -> dict[str, Any]:
    """JSON-safe dict (URLs and datetimes as strings)."""
    return model.model_dump(mode="json", exclude_none=True)


def validate(model_cls: type[BaseModel], data: Any, what: str) -> BaseModel:
    """Build a model from a dict (or pass a model through), raising DBError on bad input."""
    from pydantic import ValidationError

    from .client import DBError

    if isinstance(data, model_cls):
        return data
    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        err = exc.errors()[0]
        field = ".".join(str(p) for p in err.get("loc", ())) or "input"
        raise DBError(f"Invalid {what}: {field}: {err.get('msg')}") from None


def validate_all(model_cls: type[BaseModel], items, what: str) -> list[dict[str, Any]]:
    return [dump(validate(model_cls, item, what)) for item in items]
