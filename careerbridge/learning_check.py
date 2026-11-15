"""Formative learning checks: generated questions, deterministic quiz scoring, AI feedback."""

from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from careerbridge.model_tasks import generate_task

Text = Annotated[str, Field(min_length=1, max_length=1200)]


class CheckQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    milestone_id: str
    prompt: Text
    options: list[Text] = Field(min_length=4, max_length=4)
    correct_option: int = Field(ge=0, le=3)
    explanation: Text


class PracticeCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    milestone_id: str
    description: Text


class CheckContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    questions: list[CheckQuestion] = Field(min_length=5, max_length=5)
    practice_prompt: str = Field(min_length=1, max_length=2500)
    criteria: list[PracticeCriterion] = Field(min_length=3, max_length=3)


class CheckSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quiz_answers: dict[str, Annotated[StrictInt, Field(ge=0, le=3)]] = Field(
        min_length=5, max_length=5
    )
    practice_response: str = Field(min_length=10, max_length=8000)

    @field_validator("practice_response", mode="before")
    @classmethod
    def strip_response(cls, value):
        return value.strip() if isinstance(value, str) else value


class CriterionFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    criterion_id: str
    met: bool
    evidence: str = Field(max_length=1000)
    feedback: Text
    next_step: Text


class CheckFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    criteria: list[CriterionFeedback] = Field(min_length=3, max_length=3)
    summary: Text


def check_supported(output, data):
    questions = output["questions"]
    allowed = {m["id"] for m in data["milestones"]}
    seen = {q["milestone_id"] for q in questions}
    prompts = [q["prompt"].strip().casefold() for q in questions]
    old = {
        c["question"].strip().casefold()
        for m in data["milestones"]
        for c in m["material"]["self_checks"]
    }
    return (
        seen == allowed
        and len(set(prompts)) == 5
        and not set(prompts) & old
        and all(
            len({o.strip().casefold() for o in q["options"]}) == 4 for q in questions
        )
        and all(c["milestone_id"] in allowed for c in output["criteria"])
    )


def feedback_supported(output, data):
    items = output["criteria"]
    return (
        len({c["criterion_id"] for c in items}) == len(items)
        and {c["criterion_id"] for c in items} == {c["id"] for c in data["criteria"]}
        and all(
            (not c["met"] or bool(c["evidence"].strip()))
            and (not c["evidence"] or c["evidence"] in data["practice_response"])
            for c in items
        )
    )


def generate_check(state, data):
    from careerbridge.prompts.learning_check import check_suite

    result = generate_task(
        state, check_suite(), "check_prepare", "learning_check", data, check_supported
    )
    return {
        **result,
        "questions": [
            {"id": f"q{i + 1}", **q} for i, q in enumerate(result["questions"])
        ],
        "criteria": [
            {"id": f"c{i + 1}", **c} for i, c in enumerate(result["criteria"])
        ],
    }


def generate_feedback(state, data):
    from careerbridge.prompts.learning_check import check_suite

    return generate_task(
        state,
        check_suite(),
        "check_feedback",
        "learning_feedback",
        data,
        feedback_supported,
    )


def score_quiz(content, answers):
    return [
        {
            "question_id": q["id"],
            "milestone_id": q["milestone_id"],
            "selected_option": answers[q["id"]],
            "correct_option": q["correct_option"],
            "correct": answers[q["id"]] == q["correct_option"],
            "explanation": q["explanation"],
        }
        for q in content["questions"]
    ]
