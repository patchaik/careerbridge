"""Milestone learning material generated through the shared model gateway."""

import json
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field
from careerbridge.model_tasks import generate_task

ShortText = Annotated[str, Field(min_length=1, max_length=800)]


class LessonSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    heading: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=3000)


class LessonPractice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    setup: str = Field(min_length=1, max_length=1200)
    steps: list[ShortText] = Field(min_length=2, max_length=6)
    deliverable: str = Field(min_length=1, max_length=800)


class LessonCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: ShortText
    answer: ShortText


class LessonContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=150)
    mode: Literal["text", "hands_on"]
    learning_objective: str = Field(min_length=1, max_length=600)
    sections: list[LessonSection] = Field(min_length=1, max_length=3)
    example: str = Field(min_length=1, max_length=2500)
    practice: LessonPractice | None
    self_checks: list[LessonCheck] = Field(min_length=1, max_length=3)
    resource_ids: list[str] = Field(min_length=1, max_length=10)


def lesson_supported(output, data):
    ids = output["resource_ids"]
    allowed = {r["id"] for r in data["resources"]}
    prose = json.dumps({k: v for k, v in output.items() if k != "resource_ids"}, ensure_ascii=False)
    return (
        not any(rid in prose for rid in allowed)
        and output["mode"] == data["milestone"]["mode"]
        and (output["practice"] is not None) == (output["mode"] == "hands_on")
        and len(ids) == len(set(ids))
        and set(ids) <= allowed
    )


def generate_material(state, data):
    from careerbridge.prompts.lesson import lesson_suite

    return generate_task(
        state, lesson_suite(), "lesson", "milestone_lesson", data, lesson_supported
    )
