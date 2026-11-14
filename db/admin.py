"""Setup, demo data and reporting.

Tables are created by running db/schema.sql in the Supabase SQL Editor
(the Python client cannot run DDL). Use health_check() to confirm it worked.
"""

from __future__ import annotations

from collections import Counter

from . import client as _client
from .client import DBError, bucket_name, run, table
from . import jobs, learning, mastery, profiles, resumes, users

TABLES = ["users", "career_goals", "workflow_runs", "audit_events",
          "candidate_profiles", "skills", "candidate_skill_evidence",
          "job_postings", "job_skill_requirements", "gap_analyses",
          "learning_paths", "learning_resources", "learning_sessions",
          "rubric_versions", "assessment_attempts", "verified_skill_evidence",
          "resume_versions", "wellbeing_preferences"]

DEMO_EMAIL = "demo@careerbridge.test"


# ---- Health ------------------------------------------------------------------
def health_check() -> bool:
    """True if the database and storage bucket are reachable. Call at app startup."""
    try:
        run(table("users").select("id").limit(1), "Health check")
        _client.get_client().storage.get_bucket(bucket_name())
        return True
    except Exception:  # noqa: BLE001
        return False


def table_counts() -> dict[str, int]:
    counts = {}
    for name in TABLES:
        resp = table(name).select("id" if name != "wellbeing_preferences" else "user_id",
                                  count="exact").limit(1).execute()
        counts[name] = resp.count or 0
    return counts


# ---- Demo data (all labeled synthetic) ---------------------------------------
DEMO_JOBS = [
    {"id": "demo-ai-eng-1", "title": "Software Engineer, AI Applications", "company": "Demo Co A",
     "reqs": [("Python", "required", "Strong Python for backend services"),
              ("RAG", "required", "Build retrieval-augmented generation pipelines"),
              ("Vector databases", "preferred", "Experience with a vector store")]},
    {"id": "demo-ai-eng-2", "title": "Applied AI Engineer", "company": "Demo Co B",
     "reqs": [("Python", "required", "Python and REST APIs"),
              ("RAG", "required", "Ground LLM answers in company documents (RAG)"),
              ("LLM evaluation", "preferred", "Design evals for LLM features")]},
    {"id": "demo-ai-eng-3", "title": "Backend Engineer, GenAI Platform", "company": "Demo Co C",
     "reqs": [("Python", "required", "Production Python"),
              ("Docker", "required", "Containerized deployments with Docker"),
              ("RAG", "preferred", "Familiarity with RAG patterns")]},
]

DEMO_RUBRIC = {
    "quiz": {"questions": 5, "pass_score": 0.8,
             "topics": ["chunking", "embeddings", "retrieval", "grounding", "evaluation"]},
    "project": {"task": "Build a small RAG pipeline over 3 provided documents",
                "checks": ["retrieves relevant chunk for each test question",
                           "answers cite the source chunk",
                           "declines when the answer is not in the documents"]},
    "pass_rule": "quiz score >= 0.8 and all project checks pass",
}


def seed_demo_data() -> dict:
    """Create (or reuse) the demo persona, 3 synthetic jobs, a gap analysis,
    placeholder RAG resources and a frozen RAG rubric v1. Safe to re-run."""
    user = users.create_user(DEMO_EMAIL, "Demo Candidate (synthetic)")
    goal = users.get_active_goal(user["id"]) or users.create_goal(
        user["id"], "Software Engineer, AI Applications", location="Bay Area",
        seniority="mid", learning_goal="Close the RAG gap", modality="both")
    profile = profiles.get_latest_profile(user["id"]) or profiles.create_profile(
        user["id"], source="manual",
        parsed_text="Synthetic résumé: software developer, 5 years, Python, REST APIs, SQL.")
    profiles.confirm_profile(profile["id"])
    for skill, excerpt in [("Python", "5 years building Python services"),
                           ("REST APIs", "Designed REST APIs"), ("SQL", "Daily SQL work")]:
        profiles.add_skill_evidence(profile["id"], skill, "resume", excerpt, "present")

    job_ids = []
    for j in DEMO_JOBS:
        job = jobs.upsert_job_posting({
            "provider": "synthetic", "provider_job_id": j["id"], "title": j["title"],
            "company": j["company"], "location": "Bay Area",
            "url": f"https://example.com/jobs/{j['id']}", "completeness": "full",
            "description": "Synthetic posting for the CareerBridge demo."})
        jobs.add_job_requirements(job["id"], [
            {"skill": s, "importance": imp, "excerpt": ex} for s, imp, ex in j["reqs"]])
        job_ids.append(job["id"])

    analysis = jobs.get_latest_gap_analysis(goal["id"]) or jobs.create_gap_analysis(
        goal["id"], profile["id"], job_ids,
        existing_skills=["Python", "REST APIs", "SQL"],
        market_skills=["Python", "RAG", "Docker", "Vector databases", "LLM evaluation"],
        ranked_gaps=[
            {"skill": "RAG", "job_ids": job_ids, "importance": "required", "frequency": 3},
            {"skill": "Docker", "job_ids": [job_ids[2]], "importance": "required",
             "frequency": 1},
            {"skill": "Vector databases", "job_ids": [job_ids[0]], "importance": "preferred",
             "frequency": 1}])

    for title, slug, price in [("RAG fundamentals (placeholder)", "rag-basics", "free"),
                               ("Hands-on RAG project (placeholder)", "rag-project", "free")]:
        learning.add_resource("RAG", {"title": title, "provider": "Demo placeholder",
                                      "url": f"https://example.com/learn/{slug}",
                                      "price_type": price, "level": "beginner"})
    path = (learning.list_paths(goal["id"]) or [None])[0] or learning.create_path(
        goal["id"], "RAG", "Build and evaluate a small RAG pipeline",
        [{"id": "m1", "title": "Chunking and embeddings", "concepts": ["chunking", "embeddings"]},
         {"id": "m2", "title": "Retrieval and grounding", "concepts": ["retrieval", "grounding"],
          "mode": "hands_on"}])

    rubric = mastery.get_frozen_rubric("RAG")
    if not rubric:
        draft = mastery.create_rubric("RAG", DEMO_RUBRIC)
        mastery.approve_rubric(draft["id"])
        rubric = mastery.freeze_rubric(draft["id"])

    return {"user_id": user["id"], "goal_id": goal["id"], "profile_id": profile["id"],
            "job_ids": job_ids, "gap_analysis_id": analysis["id"], "path_id": path["id"],
            "rubric_id": rubric["id"]}


def delete_demo_data() -> bool:
    """Remove the demo persona and everything it owns. Shared demo jobs,
    resources and the rubric stay (they are reference data)."""
    user = users.get_user_by_email(DEMO_EMAIL)
    return users.delete_user(user["id"]) if user else False


# ---- Reports -----------------------------------------------------------------
def top_skill_gaps(limit: int = 10) -> list[dict]:
    """Most common gaps across every user's latest gap analysis."""
    rows = run(table("gap_analyses").select("goal_id, ranked_gaps_json, created_at")
               .order("created_at", desc=True), "Top skill gaps")
    latest, counter = set(), Counter()
    for r in rows:
        if r["goal_id"] in latest:
            continue
        latest.add(r["goal_id"])
        counter.update(g["skill"] for g in r["ranked_gaps_json"])
    return [{"skill": s, "users": n} for s, n in counter.most_common(limit)]


def export_user_data(user_id: str) -> dict:
    """Everything stored about one user, for a 'download my data' button."""
    user = users.get_user(user_id)
    if not user:
        raise DBError("User not found")
    profs = profiles.list_profiles(user_id)
    goals = users.list_goals(user_id)
    return {
        "user": user,
        "goals": goals,
        "profiles": [{**p, "skills": profiles.list_skill_evidence(p["id"]),
                      "resume_versions": resumes.list_resume_versions(p["id"])} for p in profs],
        "gap_analyses": [a for g in goals for a in jobs.list_gap_analyses(g["id"])],
        "learning_paths": [p for g in goals for p in learning.list_paths(g["id"])],
        "attempts": mastery.list_attempts(user_id),
        "verified_evidence": mastery.list_verified_evidence(user_id),
    }
