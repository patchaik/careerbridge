import copy
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from careerbridge import main, store
from careerbridge.errors import ApiError
from careerbridge.learning_material import LessonContent, lesson_supported
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.lesson import lesson_suite


def content(mode="text"):
    return {
        "title": "Left joins",
        "mode": mode,
        "learning_objective": "Explain unmatched rows.",
        "sections": [
            {
                "heading": "Keep the left rows",
                "body": "A left join preserves every left-side row.",
            }
        ],
        "example": "Customer 1 has no orders, so its order columns are null.",
        "practice": None
        if mode == "text"
        else {
            "setup": "Use synthetic rows.",
            "steps": ["Create two customers.", "Join to one order."],
            "deliverable": "A result table.",
        },
        "self_checks": [
            {
                "question": "Which rows remain?",
                "answer": "Every row from the left table.",
            }
        ],
        "resource_ids": ["sql-guide"],
    }


@pytest.mark.parametrize("mode", ["text", "hands_on"])
def test_lesson_modality_and_resource_boundary(mode):
    data = lesson_suite()["cases"][0 if mode == "text" else 1]["input"]
    good = content(mode)
    LessonContent.model_validate(good)
    assert lesson_supported(good, data)
    for patch in (
        {"mode": "hands_on" if mode == "text" else "text"},
        {"resource_ids": ["invented"]},
        {"resource_ids": ["sql-guide", "sql-guide"]},
        {"practice": {} if mode == "text" else None},
    ):
        assert not lesson_supported(good | patch, data)


@pytest.fixture
def setup(monkeypatch):
    data = lesson_suite()["cases"][0]["input"]
    plan = {
        "id": "path",
        "goal_id": "goal",
        "resource_search_id": "search",
        "status": "approved",
        "skill": data["skill"],
        "objective": data["learning_goal"],
        "learning_outcome": data["learning_outcome"],
        "milestones": [{"id": "m1", **data["milestone"]}],
        "resources": data["resources"],
    }
    snapshots = {}

    def owned(path_id, user_id):
        if path_id != "path" or user_id != "owner":
            raise ApiError(404, "not_found", "Learning path not found")
        return copy.deepcopy(plan)

    def saved(user, path, milestone=None):
        return [
            {"state_json": copy.deepcopy(s)}
            for s in snapshots.values()
            if s["status"] == "complete"
            and s["path_id"] == path
            and (milestone is None or s["milestone_id"] == milestone)
        ]

    monkeypatch.setattr(store, "get_path_flow", owned)
    monkeypatch.setattr(store.users, "get_user", lambda uid: {"consent_at": "yes"})
    monkeypatch.setattr(store.users, "list_lesson_workflows", saved)
    monkeypatch.setattr(
        store.users, "create_workflow", lambda *args: {"id": f"w{len(snapshots)}"}
    )
    monkeypatch.setattr(
        store.users,
        "save_workflow_state",
        lambda wid, phase, state: snapshots.update({wid: copy.deepcopy(state)}),
    )
    monkeypatch.setattr(store, "load_routing", lambda path: {"revision": "pinned"})
    generate = MagicMock(return_value=content())
    monkeypatch.setattr(store, "generate_material", generate)
    return plan, snapshots, generate


def test_generate_save_reload_and_repeat_without_model(setup):
    plan, states, generate = setup
    assert store.get_materials_flow("path", "owner") == {"materials": []}
    first = store.generate_material_flow("path", "m1", "owner")
    assert first["content"] == content() and first["resources"] == plan["resources"]
    assert store.generate_material_flow("path", "m1", "owner") == first
    assert store.get_materials_flow("path", "owner") == {"materials": [first]}
    generate.assert_called_once()
    state, data = generate.call_args.args
    assert state["model_routing"] == {"revision": "pinned"}
    assert data["milestone"] == {
        k: v for k, v in plan["milestones"][0].items() if k != "id"
    }
    assert data["resources"] == plan["resources"]
    assert states["w0"]["prompt_version"] == "milestone-lesson-v1"


def test_fail_retry_and_inflight_guard(setup):
    _, states, generate = setup
    generate.side_effect = ModelError("invalid_output")
    with pytest.raises(ApiError) as error:
        store.generate_material_flow("path", "m1", "owner")
    assert error.value.status_code == 503 and states["w0"]["status"] == "failed"
    assert store.get_materials_flow("path", "owner") == {"materials": []}

    def finish(*args):
        with pytest.raises(ApiError) as busy:
            store.generate_material_flow("path", "m1", "owner")
        assert busy.value.status_code == 409
        return content()

    generate.side_effect = finish
    assert store.generate_material_flow("path", "m1", "owner")["content"] == content()
    assert not store._material_in_flight


def test_acceptance_owner_milestone_consent_guards(setup, monkeypatch):
    plan, _, generate = setup
    for path, milestone, user, status in [
        ("other", "m1", "owner", 404),
        ("path", "m1", "other", 404),
        ("path", "missing", "owner", 404),
    ]:
        with pytest.raises(ApiError) as error:
            store.generate_material_flow(path, milestone, user)
        assert error.value.status_code == status
    with pytest.raises(ApiError):
        store.get_materials_flow("path", "other")
    plan["status"] = "proposed"
    with pytest.raises(ApiError) as error:
        store.generate_material_flow("path", "m1", "owner")
    assert error.value.status_code == 409
    plan["status"] = "approved"
    plan["milestones"][0]["resource_ids"] = ["not-in-snapshot"]
    with pytest.raises(ApiError) as error:
        store.generate_material_flow("path", "m1", "owner")
    assert error.value.status_code == 409
    monkeypatch.setattr(store.users, "get_user", lambda uid: {})
    with pytest.raises(ApiError) as error:
        store.generate_material_flow("path", "m1", "owner")
    assert error.value.status_code == 403
    generate.assert_not_called()


def test_lesson_routes_require_auth():
    client = TestClient(main.app)
    assert client.get("/api/paths/example/materials").status_code in (401, 403)
    assert client.post("/api/paths/example/milestones/m1/material").status_code in (
        401,
        403,
    )


def test_lesson_fixture_schema():
    suite = lesson_suite()
    for case in suite["cases"]:
        Draft202012Validator(suite["tasks"][case["task"]]["input_schema"]).validate(
            case["input"]
        )


def test_database_disconnect_before_generation_allows_retry(setup, monkeypatch):
    from database.client import DBError

    _, _, generate = setup
    create = MagicMock(side_effect=[DBError("Server disconnected"), {"id": "w0"}])
    monkeypatch.setattr(store.users, "create_workflow", create)
    with pytest.raises(ApiError):
        store.generate_material_flow("path", "m1", "owner")
    assert not store._material_in_flight
    generate.assert_not_called()
    assert store.generate_material_flow("path", "m1", "owner")["content"] == content()


def test_material_does_not_expose_internal_resource_ids():
    data = lesson_suite()["cases"][0]["input"]
    output = content()
    output["sections"][0]["body"] += " Resource: sql-guide."
    assert not lesson_supported(output, data)
