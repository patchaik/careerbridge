"""Career Analyst: parse a resume and extract evidence-backed skills."""
import io
import os
import re
from typing import TypedDict
from zipfile import ZipFile

from docx import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pypdf import PdfReader

from careerbridge.mock_skills import extract_mock_skills
from careerbridge.prompts.career_analyst import EXTRACT_SKILLS
from careerbridge.schemas import ExtractedSkills, Skill


class AnalystState(TypedDict, total=False):
    workflow_id: str
    file_type: str
    file_data: bytes
    text: str
    skills: list[dict]
    extraction_mode: str


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
        result = ExtractedSkills(skills=[Skill(**item) for item in extract_mock_skills(state["text"])])
    elif mode == "llm":
        model = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0)
        result = model.with_structured_output(ExtractedSkills).invoke([
            SystemMessage(content=EXTRACT_SKILLS),
            HumanMessage(content=state["text"]),
        ])
    else:
        raise ValueError("CAREERBRIDGE_ANALYST_MODE must be llm or mock")
    # Only retain excerpts actually present in the extracted text.
    normalize = lambda text: re.sub(r"\s+", " ", text).strip().casefold()
    source = normalize(state["text"])
    skills = [dict(skill.model_dump(), source="resume") for skill in result.skills
              if normalize(skill.evidence) and normalize(skill.evidence) in source]
    return {"skills": skills, "extraction_mode": mode}


builder = StateGraph(AnalystState)
builder.add_node("parse_resume", parse_resume)
builder.add_node("extract_skills", extract_skills)
builder.add_edge(START, "parse_resume")
builder.add_edge("parse_resume", "extract_skills")
builder.add_edge("extract_skills", END)
analyst = builder.compile()
