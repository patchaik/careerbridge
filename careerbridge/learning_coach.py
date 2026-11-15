"""Skill learning plans; progress checks are not competency assessments."""

import os
from typing import Annotated, Literal
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ConfigDict, Field
from careerbridge.prompts.learning_coach import TUTOR
from careerbridge.model_tasks import generate_task

ShortText = Annotated[str, Field(min_length=1, max_length=500)]


class PlanMilestone(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=150)
    mode: Literal["text", "hands_on"]
    instruction: str = Field(min_length=1, max_length=1500)
    success_criteria: list[ShortText] = Field(min_length=1, max_length=3)
    resource_ids: list[str] = Field(min_length=1, max_length=10)


class LearningPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    learning_outcome: str = Field(min_length=1, max_length=600)
    milestones: list[PlanMilestone] = Field(min_length=1, max_length=5)


def plan_supported(output, data):
    resources = {r["id"] for r in data["resources"]}
    modes = {m["mode"] for m in output["milestones"]}
    expected = (
        {"text", "hands_on"} if data["modality"] == "both" else {data["modality"]}
    )
    return modes == expected and all(
        set(m["resource_ids"]) <= resources
        and len(m["resource_ids"]) == len(set(m["resource_ids"]))
        for m in output["milestones"]
    )


def propose_path(state, data):
    from careerbridge.prompts.learning_plan import plan_suite

    return generate_task(
        state, plan_suite(), "path_plan", "learning_plan", data, plan_supported
    )


def remediation(failed_criteria: list[str], rubric: dict):
    descriptions = {c["id"]: c["description"] for c in rubric["criteria"]}
    return [
        f"Practice: {descriptions.get(key, 'Review the knowledge-check concepts.')}"
        for key in failed_criteria
    ]


def answer_question(goal: str, milestones: list[dict], question: str) -> str:
    if os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "mock":
        return "Mock tutor: review the linked resource and practice explaining the selected concept."
    response = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0
    ).invoke(
        [
            SystemMessage(content=TUTOR),
            HumanMessage(
                content=f"Learning goal: {goal}\nMilestones: {milestones}\nLearner question: {question}"
            ),
        ]
    )
    if not isinstance(response.content, str):
        raise ValueError("Unexpected tutor response")
    return response.content
