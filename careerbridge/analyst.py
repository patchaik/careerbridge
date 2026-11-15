"""Career Analyst: parse a resume and extract evidence-backed skills."""

import io
import os
import re
from datetime import timedelta
from typing import TypedDict
from zipfile import ZipFile

from docx import Document
from langgraph.graph import END, START, StateGraph
from pypdf import PdfReader

from database import users
from database.client import DBError

from careerbridge.mock_skills import extract_mock_skills
from careerbridge.model_gateway import (
    ExecutionContext,
    ModelError,
    ModelGateway,
    load_routing,
    utcnow,
)
from careerbridge.prompts.career_analyst import resume_suite, source_supported
from careerbridge.schemas import ExtractedSkills, Skill


class AnalystState(TypedDict, total=False):
    workflow_id: str
    user_id: str
    model_routing: dict
    invocation_id: str | None
    file_type: str
    file_data: bytes
    text: str
    skills: list[dict]
    extraction_mode: str


def resume_routing():
    return load_routing(
        os.getenv("MODEL_ROUTING_PATH", "deployment/model-routing.yaml")
    )


def parse_resume(state: AnalystState):
    file = io.BytesIO(state["file_data"])
    if state["file_type"] == ".pdf":
        reader = PdfReader(file)
        if reader.is_encrypted or len(reader.pages) > 50:
            raise ValueError("Unsupported PDF")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        with ZipFile(file) as archive:
            if sum(item.file_size for item in archive.infolist()) > 20 * 1024 * 1024:
                raise ValueError("Document is too large")
        file.seek(0)
        doc = Document(file)
        paragraphs = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            paragraphs.extend(cell.text for row in table.rows for cell in row.cells)
        text = "\n".join(paragraphs)
    if not text.strip() or len(text) > 100_000:
        raise ValueError("Document has no readable text or is too long")
    return {"text": text}


def extract_skills(state: AnalystState):
    mode = os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm")
    if mode == "mock":
        # A deterministic fixture (careerbridge/mock_skills.py), only matching
        # skills actually present in the text — no AI calls.
        result = ExtractedSkills(
            skills=[Skill(**item) for item in extract_mock_skills(state["text"])[:30]]
        )
    elif mode == "llm":
        suite = resume_suite()
        task = suite["tasks"]["profile_extract"]
        routing = state["model_routing"]
        context = ExecutionContext(
            state["workflow_id"],
            state["user_id"],
            routing["revision"],
            task["prompt_version"],
            task["output_schema_version"],
            utcnow() + timedelta(seconds=routing["config"]["timeout_seconds"]),
        )

        def record(event):
            # The separate REST write commits even if later profile storage fails.
            try:
                saved = users.log_event(
                    state["user_id"],
                    "model_invocation",
                    "workflow",
                    state["workflow_id"],
                    event,
                )
            except DBError as exc:
                raise ModelError("invocation_not_recorded") from exc
            if not saved:
                raise ModelError("invocation_not_recorded")

        gateway = ModelGateway(routing, suite, record)
        try:
            generated = gateway.generate_json(
                "profile_extract",
                "resume_skills",
                {"source": state["text"]},
                context,
                validate_business=source_supported,
            )
            result = ExtractedSkills.model_validate(generated["validated_data"])
        finally:
            gateway.close()
    else:
        raise ValueError("CAREERBRIDGE_ANALYST_MODE must be llm or mock")

    # Only retain excerpts actually present in the extracted text.
    def normalize(text):
        return re.sub(r"\s+", " ", text).strip().casefold()

    source = normalize(state["text"])
    skills = [
        dict(skill.model_dump(), source="resume")
        for skill in result.skills
        if normalize(skill.evidence) and normalize(skill.evidence) in source
    ]
    return {
        "skills": skills,
        "extraction_mode": mode,
        "invocation_id": generated["invocation_id"] if mode == "llm" else None,
    }


builder = StateGraph(AnalystState)
builder.add_node("parse_resume", parse_resume)
builder.add_node("extract_skills", extract_skills)
builder.add_edge(START, "parse_resume")
builder.add_edge("parse_resume", "extract_skills")
builder.add_edge("extract_skills", END)
analyst = builder.compile()
