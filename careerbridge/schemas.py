"""Structured results returned by the Career Analyst."""
from typing import Literal

from pydantic import BaseModel, Field


class Skill(BaseModel):
    name: str = Field(min_length=1, max_length=120, description="A skill explicitly supported by the resume")
    category: Literal["technical", "nontechnical"]
    evidence: str = Field(min_length=1, max_length=1000, description="An exact excerpt from the resume")


class ExtractedSkills(BaseModel):
    skills: list[Skill] = Field(description="Skills and supporting resume excerpts")
