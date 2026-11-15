"""Structured results returned by the Career Analyst."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Skill(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(
        min_length=1,
        max_length=120,
        description="A skill explicitly supported by the resume",
    )
    category: Literal["technical", "nontechnical"]
    evidence: str = Field(
        min_length=1, max_length=1000, description="An exact excerpt from the resume"
    )


class ExtractedSkills(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skills: list[Skill] = Field(
        max_length=30, description="Skills and supporting resume excerpts"
    )
