"""Saved formative check lifecycle. Uses existing workflows; no mastery writes."""

import logging
import os
from datetime import datetime, timedelta
from database import learning
from careerbridge.errors import ApiError
from careerbridge.model_gateway import ModelError, load_routing, utcnow
from careerbridge.learning_check import generate_check, generate_feedback, score_quiz
from careerbridge.store import (
    call,
    get_path_flow,
    get_materials_flow,
    require_learning_consent,
)
from careerbridge.tracing import trace, trace_id

log = logging.getLogger(__name__)


def public_check(wf):
    state = wf["state_json"]
    content = state.get("content", {})
    return {
        "id": wf["id"],
        "path_id": state["path_id"],
        "status": state["status"],
        "questions": [
            {k: q[k] for k in ("id", "milestone_id", "prompt", "options")}
            for q in content.get("questions", [])
        ],
        "practice_prompt": content.get("practice_prompt"),
        "criteria": content.get("criteria", []),
        "submission": state.get("submission"),
        "result": state.get("result"),
        "independently_verified": False,
    }


def get_check(path_id, user_id):
    get_path_flow(path_id, user_id)
    saved = call(learning.get_learning_check, learning.check_id_for(path_id), user_id)
    return {"check": public_check(saved) if saved else None}


def save(before, state):
    row = call(learning.save_learning_check, before, state)
    if not row:
        raise ApiError(
            409,
            "rule_violation",
            "This check changed in another session. Reload it before retrying",
        )
    return row


def claim(wf, status, **fields):
    state = wf["state_json"]
    if (
        state.get("lease_until")
        and datetime.fromisoformat(state["lease_until"]) > utcnow()
    ):
        raise ApiError(
            409,
            "rule_violation",
            "This check is being prepared. Reload shortly to see the saved result",
        )
    return save(
        wf,
        {
            **state,
            **fields,
            "status": status,
            "lease_until": (utcnow() + timedelta(minutes=5)).isoformat(),
        },
    )


def fail(wf, status, exc):
    code = exc.code if isinstance(exc, (ModelError, ApiError)) else type(exc).__name__
    log.warning("Learning check %s failed: %s", wf["state_json"]["status"], code)
    try:
        save(
            wf,
            {**wf["state_json"], "status": status, "lease_until": None, "error": code},
        )
    except ApiError:
        # A newer lease/result must never be overwritten by this failed worker.
        pass
    raise ApiError(
        503,
        "provider_unavailable",
        "Couldn't prepare the learning check or feedback. Saved questions and submitted answers are kept; please retry.",
    ) from exc


def require_complete(plan):
    progress = plan.get("progress", {})
    if (
        plan["status"] != "completed"
        or not progress.get("total")
        or progress["completed"] != progress["total"]
    ):
        raise ApiError(
            409,
            "rule_violation",
            "Complete every milestone before taking this learning check",
        )


def start_check(path_id, user_id):
    require_learning_consent(user_id)
    plan = get_path_flow(path_id, user_id)
    existing = call(
        learning.get_learning_check, learning.check_id_for(path_id), user_id
    )
    if existing and existing["state_json"].get("content"):
        return public_check(existing)
    require_complete(plan)
    materials = {
        m["milestone_id"]: m["content"]
        for m in get_materials_flow(path_id, user_id)["materials"]
    }
    if set(materials) != {m["id"] for m in plan["milestones"]}:
        raise ApiError(
            409,
            "rule_violation",
            "Generate and complete the material for every milestone first",
        )
    data = {
        "skill": plan["skill"],
        "goal": plan["objective"],
        "outcome": plan["learning_outcome"],
        "modality": plan["modality"],
        "milestones": [
            {
                "id": m["id"],
                "title": m["title"],
                "instruction": m["instruction"],
                "success_criteria": m["success_criteria"],
                "material": materials[m["id"]],
            }
            for m in plan["milestones"]
        ],
    }
    wf = existing or call(
        learning.create_learning_check, path_id, user_id, plan["goal_id"]
    )
    # Another start may have completed between lookup and insert.
    if wf["state_json"].get("content"):
        return public_check(wf)
    wf = claim(wf, "generating", input=data)
    try:
        routing = wf["state_json"].get("model_routing") or load_routing(
            os.getenv("CHECK_MODEL_ROUTING_PATH", "deployment/check-model-routing.yaml")
        )
        wf = save(
            wf,
            {
                **wf["state_json"],
                "model_routing": routing,
                "prompt_version": "check_prepare-v1",
            },
        )
        with trace(
            "prepare-learning-check",
            user_id=user_id,
            workflow_id=wf["id"],
            input={"milestones": len(data["milestones"]), "content": "omitted"},
        ) as observation:
            content = generate_check(
                {"user_id": user_id, "workflow_id": wf["id"], "model_routing": routing},
                data,
            )
            wf = save(
                wf,
                {
                    **wf["state_json"],
                    "status": "ready",
                    "lease_until": None,
                    "content": content,
                    "prepare_trace_id": trace_id(),
                    "error": None,
                },
            )
            observation.update(
                output={"status": "saved", "questions": len(content["questions"])}
            )
        return public_check(wf)
    except Exception as exc:
        fail(wf, "new", exc)


def submit_check(check_id, user_id, submission):
    require_learning_consent(user_id)
    wf = call(learning.get_learning_check, check_id, user_id)
    if not wf:
        raise ApiError(404, "not_found", "Learning check not found")
    state = wf["state_json"]
    if state.get("submission") and state["submission"] != submission:
        raise ApiError(
            409,
            "rule_violation",
            "Answers are already submitted. Reload to see or retry feedback for those answers",
        )
    if state.get("result"):
        return public_check(wf)
    if not state.get("content"):
        raise ApiError(
            409,
            "rule_violation",
            "Prepare the learning check before submitting answers",
        )
    if set(submission["quiz_answers"]) != {
        q["id"] for q in state["content"]["questions"]
    }:
        raise ApiError(
            422,
            "validation_error",
            "Answer every question once using this check's question IDs",
        )
    if not state.get("submission"):
        require_complete(get_path_flow(state["path_id"], user_id))
    quiz = score_quiz(state["content"], submission["quiz_answers"])
    wf = claim(wf, "grading", submission=submission, quiz=quiz)
    try:
        content = wf["state_json"]["content"]
        data = {
            "goal": state["input"]["goal"],
            "practice_prompt": content["practice_prompt"],
            "criteria": content["criteria"],
            "practice_response": submission["practice_response"],
        }
        with trace(
            "feedback-learning-check",
            user_id=user_id,
            workflow_id=check_id,
            input={"content": "omitted", "criteria": len(content["criteria"])},
        ) as observation:
            feedback = generate_feedback(
                {
                    "user_id": user_id,
                    "workflow_id": check_id,
                    "model_routing": state["model_routing"],
                },
                data,
            )
            result = {
                "quiz_score": sum(q["correct"] for q in quiz),
                "quiz_total": len(quiz),
                "quiz": quiz,
                "feedback": feedback,
                "submitted_at": utcnow().isoformat(),
            }
            wf = save(
                wf,
                {
                    **wf["state_json"],
                    "status": "completed",
                    "lease_until": None,
                    "result": result,
                    "feedback_prompt_version": "check_feedback-v1",
                    "feedback_trace_id": trace_id(),
                    "error": None,
                },
            )
            observation.update(
                output={"status": "saved", "criteria": len(feedback["criteria"])}
            )
        return public_check(wf)
    except Exception as exc:
        fail(wf, "feedback_pending", exc)
