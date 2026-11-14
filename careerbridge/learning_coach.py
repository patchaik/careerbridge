"""Propose a skill-specific plan grounded in the learner's free resources."""
import os
from typing import Annotated, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from careerbridge.prompts.learning_coach import CREATE_PATH, TUTOR


class Milestone(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    explanation: str = Field(min_length=1, max_length=2000)
    exercise: str = Field(min_length=1, max_length=2000)
    resource_urls: list[str] = Field(min_length=1, max_length=5)


class LearningPlan(BaseModel):
    milestones: list[Milestone] = Field(min_length=1, max_length=5)
    criteria: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(min_length=3, max_length=5)


class CoachState(TypedDict, total=False):
    goal: str
    skill: str
    skills: list[dict]
    resources: list[dict]
    milestones: list[dict]
    rubric: dict


def propose_path(state: CoachState):
    urls = {resource["url"] for resource in state["resources"]}
    if not urls:
        raise ValueError("Free learning resources are required")
    if os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "mock":
        resource = state["resources"][0]
        skill = state["skill"]
        plan = LearningPlan(milestones=[
            Milestone(title=f"Explore {skill}", explanation=f"Review {resource['title']}.",
                      exercise=f"Explain a core concept of {skill}.", resource_urls=[resource["url"]]),
            Milestone(title="Apply the concept", explanation="Work through an example from the resource.",
                      exercise=f"Describe how you would apply {skill}.", resource_urls=[resource["url"]]),
        ], criteria=[f"Explain a core concept of {skill}.", f"Describe a practical use of {skill}.",
                     "Identify a limitation or tradeoff."])
    else:
        model = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0)
        plan = model.with_structured_output(LearningPlan).invoke([
            SystemMessage(content=CREATE_PATH),
            HumanMessage(content=f"Skill: {state['skill']}\nGoal: {state['goal']}\nConfirmed skills: {state['skills']}\nFree resources: {state['resources']}"),
        ])
    if any(url not in urls for milestone in plan.milestones for url in milestone.resource_urls):
        raise ValueError("Learning plan referenced an unavailable resource")
    return {"milestones": [item.model_dump() for item in plan.milestones],
            "rubric": {"competency": state["skill"], "learner_goal": state["goal"],
                       "criteria": [{"id": f"criterion_{i + 1}", "description": criterion} for i, criterion in enumerate(plan.criteria)],
                       "knowledge_required": 4, "knowledge_total": 5,
                       "scope": "A knowledge check and written exercise assessed on this platform; not professional experience or certification."}}


builder = StateGraph(CoachState)
builder.add_node("propose_path", propose_path)
builder.add_edge(START, "propose_path")
builder.add_edge("propose_path", END)
coach = builder.compile()


def remediation(failed_criteria: list[str], rubric: dict):
    descriptions = {c["id"]: c["description"] for c in rubric["criteria"]}
    return [f"Practice: {descriptions.get(key, 'Review the knowledge-check concepts.')}" for key in failed_criteria]


def answer_question(goal: str, milestones: list[dict], question: str) -> str:
    if os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "mock":
        return "Mock tutor: review the linked resource and practice explaining the selected concept."
    response = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0).invoke([
        SystemMessage(content=TUTOR),
        HumanMessage(content=f"Learning goal: {goal}\nMilestones: {milestones}\nLearner question: {question}"),
    ])
    if not isinstance(response.content, str):
        raise ValueError("Unexpected tutor response")
    return response.content
