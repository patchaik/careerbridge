"""C. Market evidence: job postings, per-skill requirements, gap analyses."""

from __future__ import annotations

from typing import Optional

from .client import (DBError, check_limit, delete_by_id, first, get_by_id, now_iso,
                     require, run, table)
from .models import (MAX_SKILLS, JobPostingIn, JobRequirementIn, RankedGap, dump,
                     validate, validate_all)
from .profiles import skill_id_for


# ---- Job postings (shared reference data) ------------------------------------
def upsert_job_posting(job: dict | JobPostingIn) -> dict:
    """Save a real (or labeled cached/synthetic) posting. Deduplicates on provider + ID.

    A posting needs a url and a provider: jobs are never invented.
    """
    row = dump(validate(JobPostingIn, job, "job posting"))
    row.setdefault("retrieved_at", now_iso())
    return first(run(table("job_postings").upsert(row, on_conflict="provider,provider_job_id"),
                     "Save job posting"))


def add_job_requirements(job_id: str, requirements: list[dict]) -> list[dict]:
    """Attach required/preferred skills, each with the job text that asks for it."""
    items = validate_all(JobRequirementIn, requirements, "job requirement")
    rows = [{"job_id": job_id, "skill_id": skill_id_for(i["skill"]),
             "importance": i["importance"], "excerpt": i["excerpt"],
             "confidence": i.get("confidence")} for i in items]
    if not rows:
        return []
    return run(table("job_skill_requirements").upsert(rows, on_conflict="job_id,skill_id"),
               "Save job requirements")


def get_job(job_id: str) -> Optional[dict]:
    return get_by_id("job_postings", job_id, "job posting")


def list_jobs(job_ids: list[str]) -> list[dict]:
    if not job_ids:
        return []
    return run(table("job_postings").select("*").in_("id", job_ids), "List jobs")


def list_requirements(job_id: str) -> list[dict]:
    return run(table("job_skill_requirements")
               .select("*, skills(canonical_name, category)").eq("job_id", job_id),
               "List job requirements")


def delete_job(job_id: str) -> bool:
    return delete_by_id("job_postings", job_id, "job posting")


# ---- Gap analyses (versioned snapshots, never edited in place) ----------------
def create_gap_analysis(goal_id: str, profile_id: str, job_ids: list[str],
                        existing_skills: list, market_skills: list,
                        ranked_gaps: list[dict]) -> dict:
    """Save one gap analysis. Each gap must name the job(s) that ask for it."""
    check_limit(existing_skills, MAX_SKILLS, "existing skills")
    check_limit(market_skills, MAX_SKILLS, "market skills")
    check_limit(ranked_gaps, MAX_SKILLS, "skill gaps")
    gaps = validate_all(RankedGap, ranked_gaps, "skill gap")
    known = set(job_ids)
    for g in gaps:
        stray = set(g["job_ids"]) - known
        if stray:
            raise DBError(f"Gap '{g['skill']}' cites job(s) not in this analysis: "
                          f"{', '.join(sorted(stray))}")
    found = {j["id"] for j in list_jobs(job_ids)}
    missing = known - found
    if missing:
        raise DBError(f"Unknown job posting id(s): {', '.join(sorted(missing))}")
    row = {"goal_id": goal_id, "profile_id": profile_id, "job_ids_json": list(job_ids),
           "existing_skills_json": list(existing_skills),
           "market_skills_json": list(market_skills), "ranked_gaps_json": gaps}
    return first(run(table("gap_analyses").insert(row), "Save gap analysis"))


def get_gap_analysis(analysis_id: str) -> Optional[dict]:
    return get_by_id("gap_analyses", analysis_id, "gap analysis")


def get_latest_gap_analysis(goal_id: str) -> Optional[dict]:
    return first(run(table("gap_analyses").select("*").eq("goal_id", goal_id)
                     .order("created_at", desc=True).limit(1), "Get gap analysis"))


def list_gap_analyses(goal_id: str) -> list[dict]:
    return run(table("gap_analyses").select("*").eq("goal_id", goal_id)
               .order("created_at", desc=True), "List gap analyses")


def delete_gap_analysis(analysis_id: str) -> bool:
    return delete_by_id("gap_analyses", analysis_id, "gap analysis")


def gap_report(analysis_id: str) -> dict:
    """Gap analysis with full job details and requirement excerpts, for the results screen."""
    analysis = require(get_gap_analysis(analysis_id), "Gap analysis")
    jobs = {j["id"]: j for j in list_jobs(analysis["job_ids_json"])}
    gaps = []
    for gap in analysis["ranked_gaps_json"]:
        sources = []
        for jid in gap["job_ids"]:
            job = jobs.get(jid)
            if not job:
                continue
            excerpts = [r["excerpt"] for r in list_requirements(jid)
                        if (r.get("skills") or {}).get("canonical_name", "").lower()
                        == gap["skill"].lower()]
            sources.append({"job_id": jid, "title": job["title"], "company": job.get("company"),
                            "url": job["url"], "provider": job["provider"],
                            "excerpt": excerpts[0] if excerpts else None})
        gaps.append({**gap, "sources": sources})
    return {**analysis, "jobs": list(jobs.values()), "gaps": gaps}
