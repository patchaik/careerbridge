"""HTTP API: enqueue work and read workflow/profile state."""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from careerbridge import db
from careerbridge.assessor import Submission

MAX_FILE_SIZE = 5 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.initialize()
    yield


app = FastAPI(title="CareerBridge", lifespan=lifespan)
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(static_dir / "index.html")


class ConfirmedSkill(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Literal["technical", "nontechnical"]
    # User corrections can be recorded without an excerpt.
    evidence: str | None = Field(default=None, max_length=1000)


class Confirmation(BaseModel):
    skills: list[ConfirmedSkill] = Field(max_length=200)


@app.post("/api/profiles/resume", status_code=202)
async def upload_resume(file: UploadFile = File(...)):
    file_type = Path(file.filename or "").suffix.lower()
    if file_type not in {".pdf", ".docx"}:
        raise HTTPException(400, "Upload a PDF or DOCX resume")
    data = await file.read(MAX_FILE_SIZE + 1)
    await file.close()
    if not data or len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "The file must be between 1 byte and 5 MB")
    workflow_id, profile_id = uuid4(), uuid4()
    db.create_upload(workflow_id, profile_id, file_type, data)
    return {"workflow_id": workflow_id, "profile_id": profile_id, "status": "queued"}


@app.get("/api/workflows/{workflow_id}")
def workflow_status(workflow_id: UUID):
    workflow = db.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")
    return workflow


@app.get("/api/profiles/{profile_id}")
def profile(profile_id: UUID):
    result = db.get_profile(profile_id)
    if not result:
        raise HTTPException(404, "Profile not found")
    return result


@app.post("/api/profiles/{profile_id}/confirm", status_code=202)
def confirm_profile(profile_id: UUID, body: Confirmation):
    workflow_id = uuid4()
    result = db.enqueue_confirmation(workflow_id, profile_id,
                                     [skill.model_dump() for skill in body.skills])
    if result == "missing":
        raise HTTPException(404, "Profile not found")
    if result == "not_ready":
        raise HTTPException(409, "Profile is not ready for confirmation")
    return {"workflow_id": result, "profile_id": profile_id}


class PathRequest(BaseModel):
    profile_id: UUID
    resource_search_id: UUID
    goal: str = Field(min_length=1, max_length=1000)


class RevisionRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=1000)


class ApprovalRequest(BaseModel):
    revision: int = Field(ge=1)


def queue_learning(profile_id, kind, payload):
    workflow_id = uuid4()
    if not db.enqueue(workflow_id, profile_id, kind, payload):
        raise HTTPException(409, "A confirmed profile is required")
    return {"workflow_id": workflow_id, "status": "queued"}


def require_path(path_id):
    path = db.get_path(path_id)
    if not path:
        raise HTTPException(404, "Learning path not found")
    return path


@app.post("/api/learning-paths", status_code=202)
def create_path(body: PathRequest):
    resources = db.get_resource_search(body.resource_search_id)
    if not resources or resources["profile_id"] != body.profile_id:
        raise HTTPException(404, "Resource search not found for this profile")
    if not resources["result"]["free"]:
        raise HTTPException(409, "Find at least one free resource before creating a learning path")
    return queue_learning(body.profile_id, "create_path", {"path_id": str(uuid4()), "goal": body.goal,
                                                           "resource_search_id": str(body.resource_search_id)})


@app.get("/api/learning-paths/{path_id}")
def learning_path(path_id: UUID):
    return require_path(path_id)


@app.post("/api/learning-paths/{path_id}/revisions", status_code=202)
def revise_learning_path(path_id: UUID, body: RevisionRequest):
    path = require_path(path_id)
    if path["approved_at"]:
        raise HTTPException(409, "The approved rubric is frozen")
    return queue_learning(path["profile_id"], "revise_path", {"path_id": str(path_id), "goal": body.goal})


@app.post("/api/learning-paths/{path_id}/approve", status_code=202)
def approve_rubric(path_id: UUID, body: ApprovalRequest):
    path = require_path(path_id)
    if path["approved_at"] or path["revision"] != body.revision:
        raise HTTPException(409, "Review the current unapproved rubric revision")
    return queue_learning(path["profile_id"], "approve_rubric", {"path_id": str(path_id), "revision": body.revision})


@app.post("/api/learning-paths/{path_id}/assessments/prepare", status_code=202)
def prepare(path_id: UUID):
    path = require_path(path_id)
    if not path["approved_at"]:
        raise HTTPException(409, "Approve the rubric before starting assessment")
    if "criteria" not in path["rubric"]:
        raise HTTPException(409, "This older learning path needs to be recreated with resources and a skill-specific rubric")
    return queue_learning(path["profile_id"], "prepare_assessment", {"path_id": str(path_id)})


@app.get("/api/assessment-sets/{set_id}")
def assessment_set(set_id: UUID):
    assessment = db.get_assessment_set(set_id)
    if not assessment:
        raise HTTPException(404, "Assessment not found")
    questions = [{key: question[key] for key in ("id", "question", "options")} for question in assessment["questions"]]
    return {"id": assessment["id"], "path_id": assessment["path_id"], "rubric_revision": assessment["rubric_revision"],
            "questions": questions, "project_task": assessment["project_task"]}


@app.post("/api/learning-paths/{path_id}/assessments", status_code=202)
def submit_assessment(path_id: UUID, body: Submission):
    path = require_path(path_id)
    if not path["approved_at"]:
        raise HTTPException(409, "Approve the rubric before submitting assessment")
    assessment = db.get_assessment_set(body.assessment_set_id)
    if not assessment or assessment["path_id"] != path_id or assessment["rubric_revision"] != path["revision"]:
        raise HTTPException(409, "Assessment does not match approved rubric")
    return queue_learning(path["profile_id"], "assess", {"path_id": str(path_id), "submission": body.model_dump(mode="json")})


@app.get("/api/assessments/{attempt_id}")
def assessment(attempt_id: UUID):
    attempt = db.get_attempt(attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment not found")
    return attempt


class CoachMessage(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@app.post("/api/learning-paths/{path_id}/coach", status_code=202)
def ask_coach(path_id: UUID, body: CoachMessage):
    path = require_path(path_id)
    if not path["approved_at"]:
        raise HTTPException(409, "Approve the rubric before coaching")
    return queue_learning(path["profile_id"], "coach_message", {"path_id": str(path_id), "question": body.question})


class JobSearchRequest(BaseModel):
    profile_id: UUID
    role: str = Field(min_length=1, max_length=200)
    location: str = Field(default="", max_length=150)
    seniority: str = Field(default="", max_length=100)


class ResourceSearchRequest(BaseModel):
    analysis_id: UUID
    skill: str = Field(min_length=1, max_length=120)


@app.post("/api/jobs/search", status_code=202)
def search_jobs(body: JobSearchRequest):
    return queue_learning(body.profile_id, "search_jobs", {"role": body.role, "location": body.location,
                                                            "seniority": body.seniority})


@app.get("/api/analyses/{analysis_id}")
def analysis(analysis_id: UUID):
    result = db.get_analysis(analysis_id)
    if not result:
        raise HTTPException(404, "Job analysis not found")
    return result


@app.post("/api/resources/search", status_code=202)
def search_resources(body: ResourceSearchRequest):
    analysis = db.get_analysis(body.analysis_id)
    if not analysis:
        raise HTTPException(404, "Job analysis not found")
    selected = next((gap["skill"] for gap in analysis["result"]["gaps"]
                     if gap["skill"].casefold() == body.skill.strip().casefold()), None)
    if not selected:
        raise HTTPException(422, "Select a gap from the job analysis")
    return queue_learning(analysis["profile_id"], "search_resources",
                          {"analysis_id": str(body.analysis_id), "skill": selected})


@app.get("/api/resource-searches/{search_id}")
def resources(search_id: UUID):
    result = db.get_resource_search(search_id)
    if not result:
        raise HTTPException(404, "Resource search not found")
    return result
