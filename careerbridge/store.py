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
import json
import os
from time import perf_counter
from threading import Lock
from pathlib import Path
from typing import Optional

from database import jobs, learning, mastery, profiles, users
from database.client import DBError

from careerbridge.analyst import analyst, resume_routing
from careerbridge.model_gateway import ModelError, load_routing, utcnow
from careerbridge.timings import measure
from careerbridge.tracing import trace, trace_id
from careerbridge.prompts.career_analyst import resume_suite
from careerbridge.prompts.search_agent import job_suite
from careerbridge.prompts.resources import resource_suite
from careerbridge.prompts.learning_plan import plan_suite
from careerbridge.assessor import assessor, prepare_assessment
from careerbridge.errors import ApiError, db_error_to_api_error
from careerbridge.learning_coach import answer_question, propose_path, remediation
from careerbridge.learning_material import generate_material
from careerbridge.prompts.lesson import lesson_suite
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

def owned_profile(profile_id: str, user_id: str) -> dict:
    profile = call(profiles.get_profile, profile_id)
    if not profile or profile["user_id"] != user_id:
        raise ApiError(404, "not_found", "Profile not found")
    return profile


def get_saved_profile_flow(user_id: str, profile_id: Optional[str] = None) -> dict:
    profile = owned_profile(profile_id, user_id) if profile_id else call(profiles.get_latest_profile, user_id)
    if not profile:
        raise ApiError(404, "not_found", "No saved profile yet. Upload your résumé or add your skills first.")
    return profile_response(profile["id"])


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
                         idempotency_key: Optional[str], user_id: str) -> dict:
    profile = owned_profile(profile_id, user_id)

    def compute():
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

    scoped_key = f"confirm:{user_id}:{profile_id}:{idempotency_key}" if idempotency_key else None
    return with_idempotency(scoped_key, compute)


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
        "source": "keenable" if posting["provider_job_id"].startswith("keenable:") else posting["provider"],
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
    started = perf_counter()
    timings = {stage: 0.0 for stage in ("search", "fetch", "model", "save")}
    if goal["user_id"] != user_id:
        raise ApiError(404, "not_found", "Goal not found")
    profile = call(profiles.get_latest_profile, user_id)
    if not profile or not profile.get("confirmed_at"):
        raise ApiError(409, "rule_violation", "Confirm a profile before searching for jobs")
    wf = call(users.create_workflow, user_id, goal["id"])
    state = {"kind": "search_jobs", "status": "running", "stage": "searching", "timings_ms": timings}
    try:
        mode = os.getenv("CAREERBRIDGE_SEARCH_MODE", "live")
        if mode not in ("live", "mock"):
            raise ModelError("invalid_search_mode")
        live = mode == "live"
        routing = load_routing(os.getenv("JOB_MODEL_ROUTING_PATH", "deployment/job-model-routing.yaml")) if live else None
        if routing:
            task = job_suite()["tasks"]["job_extract"]
            state.update(model_routing=routing, prompt_version=task["prompt_version"],
                         output_schema_version=task["output_schema_version"])
        call(users.save_workflow_state, wf["id"], "JOB_SEARCH", state)
        agent_out = job_search_agent.invoke({
            "role": goal["target_role"], "location": goal.get("location") or "",
            "seniority": goal.get("seniority") or "",
            "user_id": user_id, "workflow_id": wf["id"], "model_routing": routing, "timings_ms": timings,
        })["result"]
        provider = "synthetic" if agent_out["source"] == "synthetic" else "cached"
        posting_ids = []
        with measure(timings, "save"):
            for job in agent_out["jobs"][:limit]:
                # The existing relational schema accepts only explicit importance.
                # Omit unknowns rather than falsely claiming they are preferred.
                reqs = [r for r in job["requirements"] if r["importance"] in ("required", "preferred")]
                if not reqs:
                    continue
                # Each retrieval is an immutable reference snapshot, so later searches
                # cannot rewrite the evidence cited by an earlier gap analysis.
                snapshot_id = _provider_job_id(json.dumps(job, sort_keys=True))
                posting = call(jobs.upsert_job_posting, {
                    "provider": provider, "provider_job_id": agent_out["source"] + ":" + snapshot_id,
                    "title": job["title"], "url": job["url"], "company": job.get("employer"),
                    "completeness": "partial", "retrieved_at": job["retrieved_at"],
                })
                call(jobs.add_job_requirements, posting["id"], reqs)
                posting_ids.append(posting["id"])
        result = {"job_ids": posting_ids, "source": agent_out["source"], "profile_id": profile["id"]}
        timings["total"] = round((perf_counter() - started) * 1000, 3)
        state.update(status="complete", stage="complete", result=result)
        call(users.save_workflow_state, wf["id"], "JOB_SEARCH", state)
        return {"workflow_id": wf["id"], "jobs": [get_job_flow(jid) for jid in posting_ids],
                "fallback_used": False, "source": agent_out["source"]}
    except Exception as exc:
        timings["total"] = round((perf_counter() - started) * 1000, 3)
        state.update(status="failed", stage="failed", error=exc.code if isinstance(exc, ModelError) else "search_failed")
        call(users.save_workflow_state, wf["id"], "JOB_SEARCH", state)
        if isinstance(exc, ApiError):
            raise
        if isinstance(exc, ModelError):
            setup_messages = {
                "provider_not_configured": "Live job search is not configured. The server needs a job model routing file and credentials for the selected model.",
                "capability_unavailable": "Live job search is not ready. The server needs a current, passing job model capability report. Run scripts.check_job_model after configuring model connectivity.",
            }
            if exc.code in setup_messages:
                raise ApiError(503, "provider_unavailable", setup_messages[exc.code]) from exc
        raise ApiError(503, "provider_unavailable", "Job search is unavailable. Please retry; no mock results were substituted.") from exc


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
        "job_ids": report["job_ids_json"],
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
    goal = call(users.get_goal, goal_id)
    profile = call(profiles.get_profile, profile_id)
    if not goal or goal["user_id"] != user_id or not profile or profile["user_id"] != user_id:
        raise ApiError(404, "not_found", "Goal or profile not found")
    if not profile.get("confirmed_at"):
        raise ApiError(409, "rule_violation", "Confirm your profile before gap analysis")
    job_ids = list(dict.fromkeys(job_ids))
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
                   "importance": g["importance"], "frequency": g["frequency"],
                   "reason": "Not evidenced in your confirmed profile; this does not establish inability."} for g in gaps]

    analysis = call(jobs.create_gap_analysis, goal_id, profile_id, job_ids,
                    existing, sorted(market_names)[:10], ranked_gaps)
    record_workflow(user_id, goal_id, "analyze_skills", "complete", result={"analysis_id": analysis["id"]})
    return _map_gap_analysis(call(jobs.gap_report, analysis["id"]))


def get_gap_analysis_flow(analysis_id: str, user_id: str) -> dict:
    analysis = call(jobs.get_gap_analysis, analysis_id)
    goal = call(users.get_goal, analysis["goal_id"]) if analysis else None
    if not goal or goal["user_id"] != user_id:
        raise ApiError(404, "not_found", "Gap analysis not found")
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


def generate_path_flow(user_id: str, resource_search_id: str, learning_goal: str,
                       modality: str, resource_ids: list[str]) -> dict:
    require_learning_consent(user_id)
    search = get_resource_search_flow(user_id, resource_search_id)
    profile = call(profiles.get_latest_profile, user_id)
    if not profile or not profile.get("confirmed_at"):
        raise ApiError(409, "rule_violation", "Confirm a profile before generating a learning plan")
    available = {r["id"]: r for kind in ("free", "paid", "mixed", "unknown") for r in search[kind]}
    if len(set(resource_ids)) != len(resource_ids) or not set(resource_ids) <= available.keys():
        raise ApiError(422, "validation_error", "Choose resources from this saved search")
    resources = [available[rid] for rid in resource_ids]
    evidence = call(profiles.list_skill_evidence, profile["id"])
    data = {"skill": search["skill"], "learning_goal": learning_goal, "modality": modality,
            "confirmed_skills": list(dict.fromkeys((e.get("skills") or {}).get("canonical_name")
                for e in evidence if (e.get("skills") or {}).get("canonical_name"))),
            "resources": [{key: r[key] for key in ("id", "title", "price_type", "learning_evidence", "format")}
                          for r in resources]}
    wf = call(users.create_workflow, user_id, search["goal_id"])
    state = {"kind": "generate_path", "status": "running", "stage": "planning"}
    path = None
    try:
        routing = load_routing(os.getenv("PLAN_MODEL_ROUTING_PATH", "deployment/plan-model-routing.yaml"))
        task = plan_suite()["tasks"]["path_plan"]
        state.update(model_routing=routing, prompt_version=task["prompt_version"],
                     output_schema_version=task["output_schema_version"])
        call(users.save_workflow_state, wf["id"], "LEARNING", state)
        plan = propose_path({"user_id": user_id, "workflow_id": wf["id"], "model_routing": routing}, data)
        milestones = [{"id": f"m{i+1}", **m} for i, m in enumerate(plan["milestones"])]
        path = call(learning.create_path, search["goal_id"], search["skill"], learning_goal,
            [{"id": m["id"], "title": m["title"], "mode": "written" if m["mode"] == "text" else "hands_on"}
             for m in milestones])
        result = {"id": path["id"], "workflow_id": wf["id"], "goal_id": search["goal_id"],
                  "resource_search_id": resource_search_id, "skill": search["skill"], "objective": learning_goal,
                  "learning_outcome": plan["learning_outcome"], "modality": modality, "status": "proposed",
                  "milestones": milestones, "resources": resources, "rubric": None, "assessment_available": False}
        result = _plan_progress(result, path)
        state.update(status="complete", stage="complete", result=result)
        call(users.save_workflow_state, wf["id"], "LEARNING", state)
        return result
    except Exception as exc:
        if path:
            call(learning.delete_path, path["id"])
        state.update(status="failed", stage="failed", error=exc.code if isinstance(exc, ModelError) else "plan_failed")
        call(users.save_workflow_state, wf["id"], "LEARNING", state)
        if isinstance(exc, ApiError):
            raise
        raise ApiError(503, "provider_unavailable", "Couldn't generate the learning plan. Your saved resources are still available; please retry.") from exc


def owned_path(path_id: str, user_id: str) -> dict:
    path = call(learning.get_path, path_id)
    goal = call(users.get_goal, path["goal_id"]) if path else None
    if not goal or goal["user_id"] != user_id:
        raise ApiError(404, "not_found", "Learning path not found")
    return path


def get_path_flow(path_id: str, user_id: str) -> dict:
    path = owned_path(path_id, user_id)
    workflow = call(users.get_path_workflow, user_id, path_id)
    if workflow:
        return _plan_progress(workflow["state_json"]["result"], path)
    return _map_learning_path(path, _rubric_for_path(path))


def _plan_progress(snapshot: dict, path: dict) -> dict:
    flags = {m["id"]: m.get("done", False) for m in path["milestones_json"]}
    milestones = [{**m, "done": flags.get(m["id"], False)} for m in snapshot["milestones"]]
    completed = sum(m["done"] for m in milestones)
    return {**snapshot, "status": path["status"], "milestones": milestones,
            "progress": {"completed": completed, "total": len(milestones),
                         "next_milestone_id": next((m["id"] for m in milestones if not m["done"]), None)}}


def list_paths_flow(user_id: str) -> dict:
    paths = call(learning.list_owned_paths, user_id)
    snapshots = {w["state_json"]["result"]["id"]: w["state_json"]["result"]
                 for w in call(users.list_path_workflows, user_id, [p["id"] for p in paths])}
    return {"plans": [_plan_progress(snapshots[p["id"]], p) for p in paths if p["id"] in snapshots]}


def complete_milestone_flow(path_id: str, milestone_id: str, done: bool, user_id: str) -> dict:
    plan = get_path_flow(path_id, user_id)
    if plan["status"] == "proposed" or "resource_search_id" not in plan:
        raise ApiError(409, "rule_violation", "Accept a resource-based plan before recording progress")
    if milestone_id not in {m["id"] for m in plan["milestones"]}:
        raise ApiError(404, "not_found", "Milestone not found on this plan")
    if done and not call(users.list_lesson_workflows, user_id, path_id, milestone_id):
        raise ApiError(409, "rule_violation", "Generate and work through the material before marking it complete")
    for _ in range(5):
        path = owned_path(path_id, user_id)
        milestones = [{**m, "done": done if m["id"] == milestone_id else m.get("done", False)}
                      for m in path["milestones_json"]]
        if milestone_id not in {m["id"] for m in milestones}:
            raise ApiError(409, "rule_violation", "This plan has changed. Reload before saving progress")
        status = "completed" if all(m["done"] for m in milestones) else "in_progress"
        if call(learning.compare_and_set_progress, path, milestones, status):
            return get_path_flow(path_id, user_id)
    raise ApiError(409, "rule_violation", "Progress changed in another session. Reload and retry")


def approve_path_flow(path_id: str, user_id: str) -> dict:
    path = owned_path(path_id, user_id)
    if path["status"] not in ("proposed", "approved"):
        raise ApiError(409, "rule_violation", "Only a proposed path can be accepted")
    if not call(users.get_path_workflow, user_id, path_id):
        raise ApiError(409, "rule_violation", "Generate a new learning plan before accepting it")
    # Learner acceptance never creates, approves or freezes an assessment rubric.
    if path["status"] == "proposed":
        call(learning.update_path_status, path_id, "approved")
    return get_path_flow(path_id, user_id)



_material_lock = Lock()
_material_in_flight = set()


def get_materials_flow(path_id: str, user_id: str) -> dict:
    plan = get_path_flow(path_id, user_id)
    valid_ids = {m["id"] for m in plan["milestones"]}
    materials = {}
    for wf in call(users.list_lesson_workflows, user_id, path_id):
        result = wf["state_json"]["result"]
        if result["milestone_id"] in valid_ids:
            materials.setdefault(result["milestone_id"], result)
    return {"materials": [materials[m["id"]] for m in plan["milestones"] if m["id"] in materials]}


def generate_material_flow(path_id: str, milestone_id: str, user_id: str) -> dict:
    require_learning_consent(user_id)
    plan = get_path_flow(path_id, user_id)
    if plan["status"] == "proposed" or "resource_search_id" not in plan:
        raise ApiError(409, "rule_violation", "Accept a resource-based learning plan before generating material")
    milestone = next((m for m in plan["milestones"] if m["id"] == milestone_id), None)
    if not milestone:
        raise ApiError(404, "not_found", "Milestone not found on this plan")
    key = (user_id, path_id, milestone_id)
    # Prevent duplicate clicks in the single-process MVP, without retaining completed locks.
    with _material_lock:
        if key in _material_in_flight:
            raise ApiError(409, "rule_violation", "Material is already being generated. Wait, then reload this plan.")
        _material_in_flight.add(key)
    wf = None
    state = {"kind": "generate_lesson", "status": "running", "stage": "generating",
             "path_id": path_id, "milestone_id": milestone_id}
    try:
        saved = call(users.list_lesson_workflows, user_id, path_id, milestone_id)
        if saved:
            return saved[0]["state_json"]["result"]
        resources = [r for r in plan["resources"] if r["id"] in milestone["resource_ids"]]
        if not resources or {r["id"] for r in resources} != set(milestone["resource_ids"]):
            raise ApiError(409, "rule_violation", "This milestone has no complete saved resource references")
        data = {"skill": plan["skill"], "learning_goal": plan["objective"],
                "learning_outcome": plan["learning_outcome"],
                "milestone": {k: v for k, v in milestone.items() if k not in ("id", "done")},
                "resources": [{k: r[k] for k in ("id", "title", "price_type", "learning_evidence", "format")}
                              for r in resources]}
        wf = call(users.create_workflow, user_id, plan["goal_id"])
        routing = load_routing(os.getenv("LESSON_MODEL_ROUTING_PATH", "deployment/lesson-model-routing.yaml"))
        task = lesson_suite()["tasks"]["lesson"]
        state.update(model_routing=routing, prompt_version=task["prompt_version"],
                     output_schema_version=task["output_schema_version"])
        call(users.save_workflow_state, wf["id"], "LEARNING", state)
        content = generate_material({"user_id": user_id, "workflow_id": wf["id"], "model_routing": routing}, data)
        result = {"path_id": path_id, "milestone_id": milestone_id, "workflow_id": wf["id"],
                  "generated_at": utcnow().isoformat(), "content": content,
                  "resources": [r for r in resources if r["id"] in content["resource_ids"]]}
        state.update(status="complete", stage="complete", result=result)
        call(users.save_workflow_state, wf["id"], "LEARNING", state)
        return result
    except Exception as exc:
        if wf:
            state.update(status="failed", stage="failed", error=exc.code if isinstance(exc, ModelError) else "lesson_failed")
            call(users.save_workflow_state, wf["id"], "LEARNING", state)
        if isinstance(exc, ApiError):
            raise
        raise ApiError(503, "provider_unavailable", "Couldn't generate this milestone's material. Your plan and resources are saved; please retry.") from exc
    finally:
        with _material_lock:
            _material_in_flight.discard(key)


def set_path_status_flow(path_id: str, status: str, user_id: str) -> dict:
    path = owned_path(path_id, user_id)
    if path["status"] == "proposed":
        raise ApiError(409, "rule_violation", "Accept the plan before recording progress")
    if call(users.get_path_workflow, user_id, path_id):
        raise ApiError(409, "rule_violation", "Use milestone completion to update this plan's progress")
    call(learning.update_path_status, path_id, status)
    return get_path_flow(path_id, user_id)


def require_learning_consent(user_id: str):
    if not (call(users.get_user, user_id) or {}).get("consent_at"):
        raise ApiError(403, "consent_required", "Processing consent is required for resource discovery and learning plans")


def discover_resources_flow(user_id: str, analysis_id: str, skill: str) -> dict:
    started = perf_counter()
    timings = {stage: 0.0 for stage in ("search", "fetch", "model", "save")}
    require_learning_consent(user_id)
    analysis = get_gap_analysis_flow(analysis_id, user_id)
    gap = next((g for g in analysis["gaps"] if g["skill"].casefold() == skill.strip().casefold()), None)
    if not gap:
        raise ApiError(422, "validation_error", "Choose a skill from this gap analysis")
    skill = gap["skill"]
    wf = call(users.create_workflow, user_id, analysis["goal_id"])
    diagnostics = {"stage": "configuration"}
    state = {"kind": "discover_resources", "status": "running", "stage": "searching",
             "timings_ms": timings, "diagnostics": diagnostics}
    with trace("discover-resources", user_id=user_id, workflow_id=wf["id"],
               input={"skill": skill, "access": ["free", "paid"]}) as observation:
        state["trace_id"] = trace_id()
        try:
            routing = load_routing(os.getenv("RESOURCE_MODEL_ROUTING_PATH", "deployment/resource-model-routing.yaml"))
            task = resource_suite()["tasks"]["resource_extract"]
            state.update(model_routing=routing, prompt_version=task["prompt_version"],
                         output_schema_version=task["output_schema_version"])
            diagnostics["stage"] = "save"
            call(users.save_workflow_state, wf["id"], "LEARNING", state)
            result = resource_search_agent.invoke({"skill": skill, "user_id": user_id,
                        "workflow_id": wf["id"], "model_routing": routing,
                        "timings_ms": timings, "diagnostics": diagnostics})["result"]
            diagnostics["stage"] = "save"
            with measure(timings, "save"), trace("save-resources",
                    input={"resource_count": sum(len(result[k]) for k in ("free", "paid", "mixed", "unknown"))}) as saved:
                for kind in ("free", "paid", "mixed", "unknown"):
                    for item in result[kind]:
                        row = call(learning.add_resource, skill, {"title": item["title"], "url": item["url"],
                            "price_type": kind, "provider": "keenable", "modality": item["format"]})
                        call(learning.mark_resource_verified, row["id"])
                        item["id"] = row["id"]
                # Retain immutable price/coverage evidence for reload.
                result.update(workflow_id=wf["id"], analysis_id=analysis_id, goal_id=analysis["goal_id"])
                state.update(status="complete", stage="complete", result=result)
                call(users.save_workflow_state, wf["id"], "LEARNING", state)
                saved.update(output={"status": "saved"})
            timings["total"] = round((perf_counter() - started) * 1000, 3)
            diagnostics["stage"] = "complete"
            call(users.save_workflow_state, wf["id"], "LEARNING", state)
            observation.update(output={"counts": {k: len(result[k]) for k in ("free", "paid", "mixed", "unknown")}},
                               metadata={"timings_ms": timings})
            return result
        except Exception as exc:
            timings["total"] = round((perf_counter() - started) * 1000, 3)
            code = exc.code if isinstance(exc, ModelError) else "resource_discovery_failed"
            diagnostics.update(error_code=code, exception_type=type(exc).__name__)
            if isinstance(exc, ModelError) and exc.diagnostics:
                diagnostics["model_validation"] = exc.diagnostics
            stage = diagnostics["stage"]
            state.update(status="failed", stage="failed", error=code)
            observation.update(level="ERROR", status_message=code,
                               output={"status": "failed", "stage": stage},
                               metadata={"diagnostics": diagnostics, "timings_ms": timings})
            try:
                call(users.save_workflow_state, wf["id"], "LEARNING", state)
            except ApiError:
                pass  # The trace still records the failure if Supabase is unavailable.
            messages = {
                "configuration": "Resource discovery is not configured. Please contact support.",
                "search": "The resource search service could not complete the search. Please retry.",
                "fetch": "Resource pages could not be read. Please retry.",
                "extraction": "The model could not extract verified resources from the pages. Please retry.",
                "save": "Resources could not be saved. Please retry.",
            }
            message = messages.get(stage, "Resource discovery failed. Please retry.")
            if code in {"provider_not_configured", "capability_unavailable", "unsupported_route"}:
                message = messages["configuration"]
            elif code == "invalid_output":
                message = "Resources were found, but their details could not be verified against the source pages. Please retry."
            raise ApiError(503, "provider_unavailable", f"{message} Reference: {wf['id']}") from exc


def get_resource_search_flow(user_id: str, workflow_id: str) -> dict:
    workflow = call(users.get_workflow, workflow_id)
    state = (workflow or {}).get("state_json") or {}
    if not workflow or workflow["user_id"] != user_id or state.get("kind") != "discover_resources":
        raise ApiError(404, "not_found", "Resource search not found")
    if state.get("status") != "complete":
        raise ApiError(409, "rule_violation", "Resource search is not complete")
    return state["result"]


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
              session_id: Optional[str], mode: str, user_id: str) -> dict:
    path = owned_path(path_id, user_id)
    if call(users.get_path_workflow, user_id, path_id):
        raise ApiError(501, "not_implemented", "Tutor delivery is not available for this learning plan")
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
    path = owned_path(path_id, user_id)
    if call(users.get_path_workflow, user_id, path_id):
        raise ApiError(409, "assessment_unavailable", "This learning plan supports self-checks, not competency assessment")
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
    from careerbridge.progress import get_progress
    return get_progress(user_id)
