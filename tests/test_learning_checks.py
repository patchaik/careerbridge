import copy
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from careerbridge import check_flows as flow, main
from careerbridge.errors import ApiError
from careerbridge.learning_check import check_supported, feedback_supported
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.learning_check import check_suite


def generated():
    return {
        "questions": [
            {
                "id": f"q{i + 1}",
                "milestone_id": "m1",
                "prompt": f"Question {i + 1}",
                "options": [
                    "All left rows",
                    "Only matches",
                    "All right rows",
                    "No rows",
                ],
                "correct_option": 0,
                "explanation": "Preserves the left rows.",
            }
            for i in range(5)
        ],
        "practice_prompt": "Explain a left join.",
        "criteria": [
            {
                "id": f"c{i + 1}",
                "milestone_id": "m1",
                "description": f"Criterion {i + 1}",
            }
            for i in range(3)
        ],
    }


def feedback():
    return {
        "summary": "Review joins.",
        "criteria": [
            {
                "criterion_id": f"c{i + 1}",
                "met": False,
                "evidence": "",
                "feedback": "Explain which rows remain.",
                "next_step": "Review the example.",
            }
            for i in range(3)
        ],
    }


def submission():
    return {
        "quiz_answers": {f"q{i + 1}": 0 if i < 3 else 1 for i in range(5)},
        "practice_response": "I am unsure how joins work.",
    }


@pytest.fixture
def setup(monkeypatch):
    data = check_suite()["cases"][0]["input"]
    plan = {
        "id": "path",
        "goal_id": "goal",
        "status": "completed",
        "skill": data["skill"],
        "objective": data["goal"],
        "learning_outcome": data["outcome"],
        "modality": data["modality"],
        "milestones": [
            {k: v for k, v in m.items() if k != "material"} for m in data["milestones"]
        ],
        "progress": {"completed": 1, "total": 1, "next_milestone_id": None},
    }
    rows = {}

    def owned(pid, uid):
        if pid != "path" or uid != "owner":
            raise ApiError(404, "not_found", "Learning path not found")
        return copy.deepcopy(plan)

    def create(pid, uid, gid):
        cid = flow.learning.check_id_for(pid)
        rows.setdefault(
            cid,
            {
                "id": cid,
                "user_id": uid,
                "goal_id": gid,
                "state_json": {
                    "kind": "learning_check",
                    "path_id": pid,
                    "status": "new",
                    "revision": 0,
                },
            },
        )
        return copy.deepcopy(rows[cid])

    def get(cid, uid):
        row = rows.get(cid)
        return copy.deepcopy(row) if row and row["user_id"] == uid else None

    def save(before, state):
        cid = before["id"]
        if before["state_json"]["revision"] != rows[cid]["state_json"]["revision"]:
            return None
        rows[cid]["state_json"] = {
            **copy.deepcopy(state),
            "revision": before["state_json"]["revision"] + 1,
        }
        return copy.deepcopy(rows[cid])

    monkeypatch.setattr(flow, "get_path_flow", owned)
    monkeypatch.setattr(flow, "require_learning_consent", lambda uid: None)
    monkeypatch.setattr(
        flow,
        "get_materials_flow",
        lambda pid, uid: {
            "materials": [
                {"milestone_id": "m1", "content": data["milestones"][0]["material"]}
            ]
        },
    )
    monkeypatch.setattr(flow.learning, "create_learning_check", create)
    monkeypatch.setattr(flow.learning, "get_learning_check", get)
    monkeypatch.setattr(flow.learning, "save_learning_check", save)
    monkeypatch.setattr(flow, "load_routing", lambda path: {"revision": "pinned"})
    prepare, review = (
        MagicMock(return_value=generated()),
        MagicMock(return_value=feedback()),
    )
    monkeypatch.setattr(flow, "generate_check", prepare)
    monkeypatch.setattr(flow, "generate_feedback", review)
    return plan, rows, prepare, review


def test_start_private_keys_reload_repeat_and_ownership(setup):
    plan, rows, prepare, review = setup
    assert flow.get_check("path", "owner") == {"check": None}
    ready = flow.start_check("path", "owner")
    assert ready["status"] == "ready" and not ready["independently_verified"]
    assert all(
        set(q) == {"id", "milestone_id", "prompt", "options"}
        for q in ready["questions"]
    )
    assert ready["result"] is None and ready["submission"] is None
    assert (
        flow.start_check("path", "owner")
        == ready
        == flow.get_check("path", "owner")["check"]
    )
    assert (
        rows[ready["id"]]["state_json"]["content"]["questions"][0]["correct_option"]
        == 0
    )
    prepare.assert_called_once()
    review.assert_not_called()
    for action in (
        lambda: flow.get_check("path", "other"),
        lambda: flow.start_check("path", "other"),
        lambda: flow.submit_check(ready["id"], "other", submission()),
    ):
        with pytest.raises(ApiError) as exc:
            action()
        assert exc.value.status_code == 404


def test_deterministic_score_saved_submission_feedback_and_immutable_repeat(
    setup, monkeypatch
):
    plan, rows, prepare, review = setup
    verified = MagicMock()
    monkeypatch.setattr("database.mastery.record_verified_evidence", verified)
    ready = flow.start_check("path", "owner")
    result = flow.submit_check(ready["id"], "owner", submission())
    assert result["status"] == "completed" and result["result"]["quiz_score"] == 3
    assert (
        result["submission"] == submission()
        and result["result"]["feedback"] == feedback()
    )
    assert flow.get_check("path", "owner")["check"] == result
    plan["status"] = "in_progress"
    assert flow.submit_check(ready["id"], "owner", submission()) == result
    assert flow.start_check("path", "owner") == result
    with pytest.raises(ApiError) as exc:
        flow.submit_check(
            ready["id"],
            "owner",
            {**submission(), "practice_response": "Changed response."},
        )
    assert exc.value.status_code == 409
    review.assert_called_once()
    verified.assert_not_called()
    assert review.call_args.args[0]["model_routing"] == {"revision": "pinned"}


def test_generation_and_feedback_failures_retry_without_replacing_answers(setup):
    plan, rows, prepare, review = setup
    prepare.side_effect = ModelError("invalid_output")
    with pytest.raises(ApiError):
        flow.start_check("path", "owner")
    assert flow.get_check("path", "owner")["check"]["status"] == "new"
    prepare.side_effect = None
    ready = flow.start_check("path", "owner")
    review.side_effect = ModelError("provider_unavailable")
    with pytest.raises(ApiError):
        flow.submit_check(ready["id"], "owner", submission())
    pending = flow.get_check("path", "owner")["check"]
    assert (
        pending["status"] == "feedback_pending"
        and pending["submission"] == submission()
    )
    assert pending["result"] is None
    with pytest.raises(ApiError):
        flow.submit_check(
            ready["id"],
            "owner",
            {**submission(), "practice_response": "Different answers."},
        )
    review.side_effect = None
    assert (
        flow.submit_check(ready["id"], "owner", submission())["status"] == "completed"
    )
    assert prepare.call_count == 2 and review.call_count == 2


def test_completion_material_and_question_guards(setup, monkeypatch):
    plan, rows, prepare, review = setup
    plan["status"] = "in_progress"
    with pytest.raises(ApiError) as exc:
        flow.start_check("path", "owner")
    assert exc.value.status_code == 409
    plan["status"] = "completed"
    ready = flow.start_check("path", "owner")
    bad = {**submission(), "quiz_answers": {"unknown": 0}}
    with pytest.raises(ApiError) as exc:
        flow.submit_check(ready["id"], "owner", bad)
    assert exc.value.status_code == 422
    plan["status"] = "in_progress"
    with pytest.raises(ApiError) as exc:
        flow.submit_check(ready["id"], "owner", submission())
    assert exc.value.status_code == 409
    review.assert_not_called()
    rows.clear()
    plan["status"] = "completed"
    monkeypatch.setattr(flow, "get_materials_flow", lambda *args: {"materials": []})
    with pytest.raises(ApiError):
        flow.start_check("path", "owner")


def test_concurrent_requests_and_expired_lease_recovery(setup):
    plan, rows, prepare, review = setup

    def preparing(*args):
        with pytest.raises(ApiError) as exc:
            flow.start_check("path", "owner")
        assert exc.value.status_code == 409
        return generated()

    prepare.side_effect = preparing
    ready = flow.start_check("path", "owner")
    before = copy.deepcopy(rows[ready["id"]])

    def reviewing(*args):
        with pytest.raises(ApiError) as exc:
            flow.submit_check(ready["id"], "owner", submission())
        assert exc.value.status_code == 409
        return feedback()

    review.side_effect = reviewing
    flow.submit_check(ready["id"], "owner", submission())
    with pytest.raises(ApiError):
        flow.save(before, before["state_json"])
    # Simulate a crashed worker after pinning a submission; retry the same answers.
    rows[ready["id"]]["state_json"].update(
        status="grading", result=None, lease_until="2000-01-01T00:00:00+00:00"
    )
    assert (
        flow.submit_check(ready["id"], "owner", submission())["status"] == "completed"
    )


def test_source_validation_and_fixture_schemas():
    suite = check_suite()
    from careerbridge.model_gateway import TASKS
    assert set(suite["tasks"]) <= TASKS
    for case in suite["cases"]:
        Draft202012Validator(suite["tasks"][case["task"]]["input_schema"]).validate(
            case["input"]
        )
    data = suite["cases"][0]["input"]
    output = generated()
    assert check_supported(output, data)
    output["questions"][0]["milestone_id"] = "invented"
    assert not check_supported(output, data)
    output = generated()
    output["questions"][0]["options"][1] = output["questions"][0]["options"][0]
    assert not check_supported(output, data)
    output = generated()
    output["questions"][0]["prompt"] = data["milestones"][0]["material"]["self_checks"][
        0
    ]["question"]
    assert not check_supported(output, data)
    data = suite["cases"][3]["input"]
    result = feedback()
    assert feedback_supported(result, data)
    result["criteria"][0].update(met=True, evidence="invented quote")
    assert not feedback_supported(result, data)
    result["criteria"][0]["evidence"] = ""
    assert not feedback_supported(result, data)
    result = feedback()
    result["criteria"][0]["criterion_id"] = "unknown"
    assert not feedback_supported(result, data)


def test_routes_auth_strict_validation_and_extra_fields():
    client = TestClient(main.app)
    assert client.get("/api/paths/path/learning-check").status_code in (401, 403)
    assert client.post("/api/paths/path/learning-check").status_code in (401, 403)
    assert client.post(
        "/api/learning-checks/check/submit", json=submission()
    ).status_code in (401, 403)
    main.app.dependency_overrides[main.current_user_id] = lambda: "owner"
    try:
        for body in (
            {**submission(), "score": 5},
            {**submission(), "practice_response": "  "},
            {**submission(), "quiz_answers": {f"q{i + 1}": "0" for i in range(5)}},
            {**submission(), "quiz_answers": {f"q{i + 1}": True for i in range(5)}},
        ):
            assert (
                client.post("/api/learning-checks/check/submit", json=body).status_code
                == 422
            )
    finally:
        main.app.dependency_overrides.clear()
