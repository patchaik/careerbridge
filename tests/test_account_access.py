from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from careerbridge import main


@pytest.fixture
def access(monkeypatch):
    accounts = {
        user: {"id": user, "email": f"{user}@example.com"}
        for user in ("learner-a", "learner-b")
    }
    tokens = {f"token-{user}": row for user, row in accounts.items()}
    link = Mock(side_effect=lambda auth_id, _email, _metadata: accounts[auth_id])
    monkeypatch.setattr(main.users, "get_auth_user", tokens.get)
    monkeypatch.setattr(main.users, "get_or_link_app_user", link)
    monkeypatch.setattr(main.users, "get_user", accounts.get)
    monkeypatch.setattr(main.users, "delete_user", Mock(side_effect=accounts.pop))
    monkeypatch.setattr(
        main.admin,
        "export_user_data",
        Mock(side_effect=lambda user_id: {"user": accounts[user_id]}),
    )
    workflow = {
        "id": "workflow-a",
        "user_id": "learner-a",
        "state": "LEARNING",
        "state_json": {"result": {"private": "server-only"}},
    }
    monkeypatch.setattr(
        main.users, "get_workflow", Mock(side_effect={"workflow-a": workflow}.get)
    )
    return TestClient(main.app), accounts, link


def bearer(user):
    return {"Authorization": f"Bearer token-{user}"}


def test_owner_can_read_export_and_delete_own_account(access):
    client, accounts, _ = access
    for user in accounts:
        assert (
            client.get(f"/api/users/{user}", headers=bearer(user)).json()
            == accounts[user]
        )
        export = client.get(f"/api/users/{user}/export", headers=bearer(user))
        assert export.status_code == 200 and export.json() == {"user": accounts[user]}
    assert (
        client.delete("/api/users/learner-a", headers=bearer("learner-a")).status_code
        == 204
    )
    assert "learner-a" not in accounts and "learner-b" in accounts


def test_account_and_workflow_routes_require_bearer_even_in_header_mode(
    access, monkeypatch
):
    client, accounts, link = access
    monkeypatch.setattr(main, "AUTH_MODE", "header")
    for method, path in [
        ("GET", "/api/users/learner-a"),
        ("GET", "/api/users/learner-a/export"),
        ("DELETE", "/api/users/learner-a"),
        ("GET", "/api/workflows/workflow-a"),
    ]:
        for headers in (
            {},
            {"Authorization": "Bearer invalid"},
            {"X-User-Id": "learner-a"},
        ):
            assert client.request(method, path, headers=headers).status_code == 401
    link.assert_not_called()
    main.users.get_workflow.assert_not_called()
    main.admin.export_user_data.assert_not_called()
    main.users.delete_user.assert_not_called()
    assert len(accounts) == 2
    response = client.get("/api/workflows/workflow-a", headers=bearer("learner-a"))
    assert response.status_code == 200
    assert response.json()["state"] == "LEARNING"
    assert "server-only" not in response.text


def test_nonowner_gets_same_response_as_missing_record(access):
    client, accounts, _ = access
    headers = bearer("learner-b")
    for method, route in [
        ("GET", "/api/users/{}"),
        ("GET", "/api/users/{}/export"),
        ("DELETE", "/api/users/{}"),
    ]:
        other = client.request(method, route.format("learner-a"), headers=headers)
        missing = client.request(method, route.format("missing"), headers=headers)
        assert other.status_code == missing.status_code == 404
        assert other.json() == missing.json()
    main.admin.export_user_data.assert_not_called()
    main.users.delete_user.assert_not_called()
    assert len(accounts) == 2
    other = client.get("/api/workflows/workflow-a", headers=headers)
    missing = client.get("/api/workflows/missing", headers=headers)
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()


def test_retired_routes_do_not_provision_users_or_call_legacy_workflows(
    access, monkeypatch
):
    client, _accounts, link = access
    blocked = [
        (
            "/api/users",
            main.users,
            "create_user",
            {"email": "learner-a@example.com", "consent": True},
        ),
        (
            "/api/arena/tutor",
            main.store,
            "tutor_flow",
            {"path_id": "plan-a", "milestone_id": "m1", "message": "A hint"},
        ),
        (
            "/api/assessments/start",
            main.store,
            "start_assessment_flow",
            {"path_id": "plan-a"},
        ),
        (
            "/api/assessments/submit",
            main.store,
            "submit_assessment_flow",
            {"attempt_id": "attempt-a"},
        ),
    ]
    for route, module, function, body in blocked:
        call = Mock()
        monkeypatch.setattr(module, function, call)
        for headers in ({}, bearer("learner-a"), bearer("learner-b")):
            assert client.post(route, headers=headers, json=body).status_code == 501
        call.assert_not_called()
    link.assert_not_called()
