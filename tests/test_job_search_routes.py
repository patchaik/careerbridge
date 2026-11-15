from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from careerbridge import main, store
from careerbridge.errors import ApiError
from careerbridge.model_gateway import ModelError


def test_search_url_requires_post_without_looking_up_a_job(monkeypatch):
    lookup = MagicMock()
    monkeypatch.setattr(main.store, "get_job_flow", lookup)
    response = TestClient(main.app).get("/api/jobs/search")
    assert response.status_code == 405
    assert response.headers["allow"] == "POST"
    assert response.json()["error"]["code"] == "method_not_allowed"
    lookup.assert_not_called()


def test_invalid_job_id_is_rejected_before_database_access(monkeypatch):
    lookup = MagicMock()
    monkeypatch.setattr(main.store, "get_job_flow", lookup)
    response = TestClient(main.app).get("/api/jobs/not-a-uuid")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    lookup.assert_not_called()


def test_valid_job_id_still_reaches_lookup(monkeypatch):
    job_id = str(uuid4())
    lookup = MagicMock(return_value={"id": job_id})
    monkeypatch.setattr(main.store, "get_job_flow", lookup)
    response = TestClient(main.app).get(f"/api/jobs/{job_id}")
    assert response.status_code == 200
    lookup.assert_called_once_with(job_id)


def test_post_search_still_reaches_search_flow(monkeypatch):
    goal = {"id": str(uuid4()), "user_id": "owner"}
    monkeypatch.setitem(main.app.dependency_overrides, main.current_user_id, lambda: "owner")
    monkeypatch.setattr(main.users, "get_goal", lambda _: goal)
    search = MagicMock(return_value={"jobs": []})
    monkeypatch.setattr(main.store, "search_jobs_flow", search)
    response = TestClient(main.app).post("/api/jobs/search", json={"goal_id": goal["id"], "limit": 5})
    assert response.status_code == 200
    search.assert_called_once_with("owner", goal, 5)


@pytest.mark.parametrize("code,expected", [
    ("provider_not_configured", "routing file"),
    ("capability_unavailable", "capability report"),
    ("source_fetch_failed", "Please retry"),
])
def test_search_distinguishes_missing_setup_from_retriable_failures(monkeypatch, code, expected):
    monkeypatch.setenv("CAREERBRIDGE_SEARCH_MODE", "live")
    monkeypatch.setattr(store.profiles, "get_latest_profile", lambda _: {"confirmed_at": "yes"})
    monkeypatch.setattr(store.users, "create_workflow", lambda *args: {"id": "workflow"})
    saved = MagicMock()
    monkeypatch.setattr(store.users, "save_workflow_state", saved)
    monkeypatch.setattr(store, "load_routing", MagicMock(side_effect=ModelError(code)))
    with pytest.raises(ApiError) as error:
        store.search_jobs_flow("owner", {"id": "goal", "user_id": "owner"}, 5)
    assert error.value.status_code == 503
    assert expected in error.value.message
    assert saved.call_args.args[2]["error"] == code
