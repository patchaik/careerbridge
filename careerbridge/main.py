"""FastAPI app matching api/openapi.yaml. Routes are thin: parse/validate the
request, call careerbridge/store.py (which calls database/ + the agents),
and shape the response. No business logic lives here.
"""

from __future__ import annotations

import os
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from database import admin, users
from database.client import DBError

from careerbridge import store
from careerbridge.errors import ApiError, db_error_to_api_error

MAX_FILE_SIZE = 5 * 1024 * 1024

app = FastAPI(title="CareerBridge API", version="0.1.0")

cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3002").split(",") if o.strip()]
# allow_headers=["*"] already covers Authorization (the Supabase bearer token).
app.add_middleware(CORSMiddleware, allow_origins=cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------------------
# Error handling -> the Error shape everywhere
# ---------------------------------------------------------------------------

@app.exception_handler(ApiError)
async def handle_api_error(_request: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code, content=exc.body())


@app.exception_handler(DBError)
async def handle_db_error(_request: Request, exc: DBError):
    api_exc = db_error_to_api_error(str(exc))
    return JSONResponse(status_code=api_exc.status_code, content=api_exc.body())


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first_error.get("loc", ()) if p not in ("body",))
    message = first_error.get("msg", "Invalid request")
    body = {"error": {"code": "validation_error", "message": message}}
    if field:
        body["error"]["field"] = field
    return JSONResponse(status_code=422, content=body)


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, exc: Exception):
    # Never log exception details here: provider/library errors can echo résumé text.
    import logging
    logging.getLogger(__name__).error("Unhandled error: %s", type(exc).__name__)
    body = {"error": {"code": "internal_error", "message": "Something went wrong. Please try again."}}
    return JSONResponse(status_code=500, content=body)


def not_implemented(feature: str):
    raise ApiError(501, "internal_error", f"{feature} is not available yet in this build.")


# ---------------------------------------------------------------------------
# Auth: Supabase Auth bearer token (default), or X-User-Id header as a
# dev/test fallback -- see openapi.yaml securitySchemes.userId and
# docs/INTEGRATION_NOTES.md. NEVER set AUTH_MODE=header in a deployment: it
# trusts whatever user id the caller sends, with no verification at all.
# ---------------------------------------------------------------------------

AUTH_MODE = os.getenv("AUTH_MODE", "supabase").strip().lower()


def current_user_id(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> str:
    if AUTH_MODE == "header":
        if not x_user_id:
            raise ApiError(403, "forbidden", "Missing X-User-Id header")
        return x_user_id

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "unauthorized", "Missing or invalid Authorization header")

    auth_user = users.get_auth_user(token)
    if not auth_user:
        raise ApiError(401, "unauthorized", "Your session has expired. Please sign in again.")

    app_user = users.get_or_link_app_user(auth_user["id"], auth_user["email"], auth_user.get("user_metadata"))
    return app_user["id"]


def idempotency_key(key: Optional[str] = Header(default=None, alias="Idempotency-Key")) -> Optional[str]:
    return key


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    ok = admin.health_check()
    return {"status": "ok" if ok else "degraded", "database": ok, "job_provider": "cached"}


@app.get("/api/workflows/{workflow_id}")
def get_workflow(workflow_id: str):
    wf = users.get_workflow(workflow_id)
    if not wf:
        raise ApiError(404, "not_found", "Workflow not found")
    state_json = wf.get("state_json") or {}
    return {
        "workflow_id": wf["id"],
        "state": wf["state"],
        "next_action": wf.get("next_action"),
        "retry_count": wf.get("retry_count", 0),
        "result_url": None,
        "errors": [e.get("error", "") for e in (wf.get("errors_json") or [])] or
                  ([state_json["error"]] if state_json.get("error") else []),
    }


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class CreateUserBody(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    consent: bool


@app.post("/api/users")
def create_user(body: CreateUserBody):
    if not body.consent:
        raise ApiError(422, "validation_error", "Consent is required", field="consent")
    return users.create_user(body.email, body.name, consent=True)


@app.get("/api/users/{user_id}")
def get_user(user_id: str):
    user = users.get_user(user_id)
    if not user:
        raise ApiError(404, "not_found", "User not found")
    return user


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str):
    users.delete_user(user_id)
    return None


@app.get("/api/users/{user_id}/export")
def export_user_data(user_id: str):
    return admin.export_user_data(user_id)


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------

@app.post("/api/onboarding/parse", status_code=201)
async def parse_onboarding(request: Request, user_id: str = Depends(current_user_id)):
    # The contract allows multipart (résumé) OR JSON (manual skills) on this one
    # endpoint. FastAPI's typed File()/UploadFile params force multipart parsing
    # unconditionally, so both branches are handled by hand here instead.
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if file is None:
            raise ApiError(422, "validation_error", "A résumé file is required", field="file")
        data = await file.read(MAX_FILE_SIZE + 1)
        await file.close()
        if not data:
            raise ApiError(422, "validation_error", "The file is empty", field="file")
        if len(data) > MAX_FILE_SIZE:
            raise ApiError(413, "file_too_large", "Résumé must be 5 MB or smaller")
        result = store.parse_resume_flow(user_id, data, file.filename or "resume.pdf")
        data = None  # drop the only other reference to the uploaded bytes
        return result

    body = await request.json()
    skills = body.get("skills")
    if not skills or not isinstance(skills, list):
        raise ApiError(422, "validation_error", "skills is required", field="skills")
    return store.parse_manual_skills_flow(user_id, [str(s) for s in skills[:30]],
                                          body.get("experience_summary"))


@app.get("/api/profiles/{profile_id}")
def get_profile(profile_id: str):
    return store.profile_response(profile_id)


class SkillConfirmation(BaseModel):
    skill: str
    status: Literal["present", "user_confirmed", "self_reported", "not_established"]
    excerpt: Optional[str] = Field(default=None, max_length=1000)


class ConfirmProfileBody(BaseModel):
    skills: list[SkillConfirmation] = Field(max_length=30)
    remove_skill_ids: list[str] = Field(default_factory=list)
    clear_resume_text: bool = False


@app.put("/api/profiles/{profile_id}/confirm")
def confirm_profile(profile_id: str, body: ConfirmProfileBody,
                    key: Optional[str] = Depends(idempotency_key)):
    return store.confirm_profile_flow(
        profile_id, [s.model_dump() for s in body.skills], body.remove_skill_ids,
        body.clear_resume_text, key)


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

class GoalInput(BaseModel):
    target_role: str
    location: Optional[str] = None
    seniority: Optional[str] = None
    learning_goal: Optional[str] = None
    modality: Literal["text", "hands_on", "both"] = "both"


@app.post("/api/goals", status_code=201)
def create_goal(body: GoalInput, user_id: str = Depends(current_user_id)):
    return users.create_goal(user_id, body.target_role, body.location, body.seniority,
                             body.learning_goal, body.modality)


@app.get("/api/goals")
def list_goals(user_id: str = Depends(current_user_id)):
    return users.list_goals(user_id)


# ---------------------------------------------------------------------------
# Market evidence
# ---------------------------------------------------------------------------

class JobSearchBody(BaseModel):
    goal_id: str
    limit: int = Field(default=5, ge=1, le=5)


@app.post("/api/jobs/search")
def search_jobs(body: JobSearchBody, user_id: str = Depends(current_user_id)):
    goal = users.get_goal(body.goal_id)
    if not goal:
        raise ApiError(404, "not_found", "Goal not found")
    return store.search_jobs_flow(user_id, goal, body.limit)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    return store.get_job_flow(job_id)


class SkillsAnalyzeBody(BaseModel):
    goal_id: str
    profile_id: str
    job_ids: list[str] = Field(min_length=1, max_length=5)


@app.post("/api/skills/analyze")
def analyze_skills(body: SkillsAnalyzeBody, user_id: str = Depends(current_user_id)):
    return store.analyze_skills_flow(user_id, body.goal_id, body.profile_id, body.job_ids)


@app.get("/api/gap-analyses/{analysis_id}")
def get_gap_analysis(analysis_id: str):
    return store.get_gap_analysis_flow(analysis_id)


# ---------------------------------------------------------------------------
# Learning
# ---------------------------------------------------------------------------

@app.post("/api/diagnostics/start")
def start_diagnostic():
    not_implemented("Diagnostics")


@app.post("/api/diagnostics/{diagnostic_id}/submit")
def submit_diagnostic(diagnostic_id: str):
    not_implemented("Diagnostics")


class GeneratePathBody(BaseModel):
    goal_id: str
    skill: str
    modality: Optional[Literal["text", "hands_on", "both"]] = None


@app.post("/api/paths/generate", status_code=201)
def generate_path(body: GeneratePathBody, user_id: str = Depends(current_user_id)):
    goal = users.get_goal(body.goal_id)
    if not goal:
        raise ApiError(404, "not_found", "Goal not found")
    return store.generate_path_flow(user_id, goal, body.skill, body.modality)


@app.get("/api/paths/{path_id}")
def get_path(path_id: str):
    return store.get_path_flow(path_id)


@app.put("/api/paths/{path_id}/approve")
def approve_path(path_id: str):
    return store.approve_path_flow(path_id)


class PathStatusBody(BaseModel):
    status: Literal["in_progress", "paused", "completed"]


@app.put("/api/paths/{path_id}/status")
def set_path_status(path_id: str, body: PathStatusBody):
    return store.set_path_status_flow(path_id, body.status)


@app.get("/api/resources")
def list_resources(skill: str):
    return store.list_resources_flow(skill)


# ---------------------------------------------------------------------------
# Arena
# ---------------------------------------------------------------------------

class TutorBody(BaseModel):
    path_id: str
    milestone_id: str
    session_id: Optional[str] = None
    mode: Literal["written", "hands_on"] = "written"
    message: str = Field(max_length=4000)


@app.post("/api/arena/tutor")
def tutor(body: TutorBody):
    return store.tutor_flow(body.path_id, body.milestone_id, body.message, body.session_id, body.mode)


@app.post("/api/arena/practice")
def practice():
    not_implemented("Practice feedback")


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------

class StartAssessmentBody(BaseModel):
    path_id: str


@app.post("/api/assessments/start", status_code=201)
def start_assessment(body: StartAssessmentBody, user_id: str = Depends(current_user_id),
                     key: Optional[str] = Depends(idempotency_key)):
    return store.start_assessment_flow(user_id, body.path_id, key)


class AnswerBody(BaseModel):
    question_id: str
    answer: str


class SubmitAssessmentBody(BaseModel):
    attempt_id: str
    quiz_answers: list[AnswerBody] = Field(default_factory=list)
    project_submission: str = Field(default="", max_length=50000)


@app.post("/api/assessments/submit")
def submit_assessment(body: SubmitAssessmentBody, user_id: str = Depends(current_user_id),
                      key: Optional[str] = Depends(idempotency_key)):
    return store.submit_assessment_flow(
        user_id, body.attempt_id, [a.model_dump() for a in body.quiz_answers],
        body.project_submission, key)


@app.get("/api/progress")
def get_progress(user_id: str = Depends(current_user_id)):
    return store.progress_flow(user_id)


# ---------------------------------------------------------------------------
# Résumé (not supported by the agents yet) + Wellbeing (P1)
# ---------------------------------------------------------------------------

@app.post("/api/resumes/draft")
def draft_resume():
    not_implemented("Résumé drafting")


@app.get("/api/resumes/{resume_id}")
def get_resume(resume_id: str):
    not_implemented("Résumé drafting")


@app.patch("/api/resumes/{resume_id}")
def update_resume_draft(resume_id: str):
    not_implemented("Résumé drafting")


@app.put("/api/resumes/{resume_id}/approve")
def approve_resume(resume_id: str):
    not_implemented("Résumé drafting")


@app.put("/api/resumes/{resume_id}/reject")
def reject_resume(resume_id: str):
    not_implemented("Résumé drafting")


@app.post("/api/resumes/export")
def export_resume():
    not_implemented("Résumé export")


@app.put("/api/wellbeing/preferences")
def set_wellbeing_preferences():
    not_implemented("Wellbeing check-ins")


@app.post("/api/wellbeing/checkin")
def wellbeing_checkin():
    not_implemented("Wellbeing check-ins")
