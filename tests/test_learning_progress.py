import copy

import pytest
from fastapi.testclient import TestClient

from careerbridge import main, store
from careerbridge.errors import ApiError


@pytest.fixture
def saved(monkeypatch):
    path = {"id": "path", "goal_id": "goal", "status": "approved",
            "milestones_json": [{"id": "m1", "title": "Read"}, {"id": "m2", "title": "Practice"}]}
    snapshot = {"id": "path", "resource_search_id": "resources", "status": "proposed",
                "milestones": [{"id": "m1"}, {"id": "m2"}], "assessment_available": False}
    monkeypatch.setattr(store.learning, "get_path", lambda pid: copy.deepcopy(path) if pid == "path" else None)
    monkeypatch.setattr(store.users, "get_goal", lambda gid: {"user_id": "owner"})
    monkeypatch.setattr(store.users, "get_path_workflow", lambda *args: {"state_json": {"result": snapshot}})
    monkeypatch.setattr(store.users, "list_lesson_workflows", lambda *args: [{}])
    monkeypatch.setattr(store.learning, "list_owned_paths", lambda uid: [path] if uid == "owner" else [])
    monkeypatch.setattr(store.users, "list_path_workflows", lambda uid, ids: [{"state_json": {"result": snapshot}}] if ids else [])

    def save(before, milestones, status):
        assert before == path
        path.update(milestones_json=copy.deepcopy(milestones), status=status)
        return True

    monkeypatch.setattr(store.learning, "compare_and_set_progress", save)
    return path, snapshot


def test_complete_reload_repeat_reopen_and_list(saved):
    path, snapshot = saved
    initial = store.get_path_flow("path", "owner")
    assert initial["progress"] == {"completed": 0, "total": 2, "next_milestone_id": "m1"}
    first = store.complete_milestone_flow("path", "m1", True, "owner")
    assert first["status"] == "in_progress" and first["progress"]["next_milestone_id"] == "m2"
    assert store.complete_milestone_flow("path", "m1", True, "owner") == first
    assert store.get_path_flow("path", "owner") == first
    done = store.complete_milestone_flow("path", "m2", True, "owner")
    assert done["status"] == "completed" and done["progress"]["next_milestone_id"] is None
    assert store.list_paths_flow("owner") == {"plans": [done]}
    assert store.list_paths_flow("other") == {"plans": []}
    reopened = store.complete_milestone_flow("path", "m1", False, "owner")
    assert reopened["status"] == "in_progress" and reopened["progress"]["completed"] == 1
    assert reopened["progress"]["next_milestone_id"] == "m1"
    assert snapshot["milestones"] == [{"id": "m1"}, {"id": "m2"}]
    assert not reopened["assessment_available"]


def test_ownership_acceptance_material_and_status_guards(saved, monkeypatch):
    for pid, mid, uid, expected in [("other", "m1", "owner", 404), ("path", "m1", "other", 404), ("path", "bad", "owner", 404)]:
        with pytest.raises(ApiError) as exc:
            store.complete_milestone_flow(pid, mid, True, uid)
        assert exc.value.status_code == expected
    with pytest.raises(ApiError):
        store.set_path_status_flow("path", "completed", "owner")
    saved[0]["status"] = "proposed"
    with pytest.raises(ApiError) as exc:
        store.complete_milestone_flow("path", "m1", True, "owner")
    assert exc.value.status_code == 409
    saved[0]["status"] = "approved"
    monkeypatch.setattr(store.users, "list_lesson_workflows", lambda *args: [])
    with pytest.raises(ApiError) as exc:
        store.complete_milestone_flow("path", "m1", True, "owner")
    assert exc.value.status_code == 409


def test_concurrent_save_retries_without_losing_other_milestone(saved, monkeypatch):
    path, _ = saved
    attempts = []

    def save(before, milestones, status):
        attempts.append(before)
        if len(attempts) == 1:
            path["milestones_json"][1]["done"] = True
            path["status"] = "in_progress"
            return False
        assert before == path
        path.update(milestones_json=milestones, status=status)
        return True

    monkeypatch.setattr(store.learning, "compare_and_set_progress", save)
    result = store.complete_milestone_flow("path", "m1", True, "owner")
    assert len(attempts) == 2 and result["status"] == "completed"
    assert result["progress"]["completed"] == 2
    monkeypatch.setattr(store.learning, "compare_and_set_progress", lambda *args: False)
    with pytest.raises(ApiError) as exc:
        store.complete_milestone_flow("path", "m1", False, "owner")
    assert exc.value.status_code == 409


def test_progress_routes_auth_and_strict_body(saved):
    client = TestClient(main.app)
    route = "/api/paths/path/milestones/m1/completion"
    assert client.get("/api/paths").status_code in (401, 403)
    assert client.put(route, json={"done": True}).status_code in (401, 403)
    main.app.dependency_overrides[main.current_user_id] = lambda: "owner"
    try:
        for body in ({}, {"done": "false"}, {"done": 1}, {"done": True, "user_id": "other"}):
            assert client.put(route, json=body).status_code == 422
        assert client.put(route, json={"done": True}).json()["progress"]["completed"] == 1
        assert len(client.get("/api/paths").json()["plans"]) == 1
    finally:
        main.app.dependency_overrides.clear()


def test_conditional_write_disconnect_reloads_but_other_errors_surface(monkeypatch):
    from unittest.mock import MagicMock
    from database import learning
    from database.client import DBError

    monkeypatch.setattr(learning, "table", MagicMock())
    query = MagicMock(side_effect=DBError("Save learning progress failed: Server disconnected"))
    monkeypatch.setattr(learning, "run", query)
    path = {"id": "path", "status": "approved", "milestones_json": [{"id": "m1", "title": "Read", "done": False}]}
    assert not learning.compare_and_set_progress(path, path["milestones_json"], "in_progress")
    query.side_effect = DBError("permission denied")
    with pytest.raises(DBError):
        learning.compare_and_set_progress(path, path["milestones_json"], "in_progress")
