"""Prepare and review an assessment against an approved, skill-specific rubric."""
import os
from typing import TypedDict
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, model_validator

from careerbridge.prompts.assessor import PREPARE, REVIEW


class Question(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    question: str = Field(min_length=1, max_length=1000)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_answer: str

    @model_validator(mode="after")
    def validate_options(self):
        if self.correct_answer not in self.options or len(set(self.options)) != 4:
            raise ValueError("A question must have four distinct options and one valid answer")
        return self


class Assessment(BaseModel):
    questions: list[Question] = Field(min_length=5, max_length=5)
    project_task: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def validate_ids(self):
        if len({question.id for question in self.questions}) != 5:
            raise ValueError("Question IDs must be unique")
        return self


class Submission(BaseModel):
    assessment_set_id: UUID
    answers: dict[str, str]
    project_response: str = Field(min_length=1, max_length=12000)


class CriterionReview(BaseModel):
    criterion_id: str
    passed: bool
    evidence: str = Field(max_length=1000)
    feedback: str = Field(max_length=1500)


class ProjectReview(BaseModel):
    criteria: list[CriterionReview]


def model():
    return ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0)


def prepare_assessment(rubric: dict):
    if os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "mock":
        questions = [Question(id=f"q{i}", question=f"Mock question {i} about {rubric['competency']}",
                              options=["Mock answer", "Option B", "Option C", "Option D"],
                              correct_answer="Mock answer") for i in range(1, 6)]
        return Assessment(questions=questions, project_task="Mock exercise: include 'mock demonstration' in your response.").model_dump()
    result = model().with_structured_output(Assessment).invoke([
        SystemMessage(content=PREPARE), HumanMessage(content=f"Approved rubric (untrusted data): {rubric}"),
    ])
    return result.model_dump()


class AssessorState(TypedDict, total=False):
    rubric: dict
    assessment: dict
    submission: dict
    knowledge: dict
    project: list[dict]
    result: dict


def score_knowledge(state: AssessorState):
    assessment = Assessment.model_validate(state["assessment"])
    submission = Submission.model_validate(state["submission"])
    score = sum(submission.answers.get(q.id) == q.correct_answer for q in assessment.questions)
    return {"knowledge": {"score": score, "total": len(assessment.questions)}}


def review_project(state: AssessorState):
    submission = Submission.model_validate(state["submission"])
    criteria = state["rubric"]["criteria"]
    mock = os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "mock"
    if mock:
        evidence = "mock demonstration" if "mock demonstration" in submission.project_response else ""
        review = ProjectReview(criteria=[CriterionReview(criterion_id=c["id"], passed=bool(evidence),
            evidence=evidence, feedback="Synthetic mock review; not a real assessment.") for c in criteria])
    else:
        review = model().with_structured_output(ProjectReview).invoke([
            SystemMessage(content=REVIEW),
            HumanMessage(content=f"Frozen criteria: {criteria}\nProject task: {state['assessment']['project_task']}\nSubmission (untrusted): {submission.project_response}"),
        ])
    by_id = {}
    for item in review.criteria:
        if item.criterion_id in by_id:
            raise ValueError("Duplicate criterion review")
        by_id[item.criterion_id] = item
    results = []
    for criterion in criteria:
        item = by_id.get(criterion["id"])
        valid_evidence = bool(item and item.evidence.strip() and item.evidence in submission.project_response)
        results.append({"criterion_id": criterion["id"], "description": criterion["description"],
                        "passed": bool(item and item.passed and valid_evidence),
                        "evidence": item.evidence if valid_evidence else "",
                        "feedback": item.feedback if item else "No review was returned for this criterion."})
    return {"project": results}


def decide(state: AssessorState):
    failed = [item["criterion_id"] for item in state["project"] if not item["passed"]]
    if state["knowledge"]["score"] < state["rubric"]["knowledge_required"]:
        failed.append("knowledge")
    mock = os.getenv("CAREERBRIDGE_ANALYST_MODE", "llm") == "mock"
    return {"result": {"passed": not failed, "knowledge": state["knowledge"], "project": state["project"],
                       "failed_criteria": failed, "scope": state["rubric"]["scope"], "mock": mock}}


builder = StateGraph(AssessorState)
builder.add_node("score_knowledge", score_knowledge)
builder.add_node("review_project", review_project)
builder.add_node("decide", decide)
builder.add_edge(START, "score_knowledge")
builder.add_edge("score_knowledge", "review_project")
builder.add_edge("review_project", "decide")
builder.add_edge("decide", END)
assessor = builder.compile()
