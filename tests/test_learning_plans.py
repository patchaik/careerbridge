import copy
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from careerbridge import main, search_agent, store
from careerbridge.errors import ApiError
from careerbridge.learning_coach import plan_supported
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.resources import resource_source_supported


def resource(rid="free-id", kind="free"):
    return {
        "id": rid,
        "title": "SQL joins",
        "price_type": kind,
        "price_evidence": "Free access." if kind == "free" else "Price: $20.",
        "learning_evidence": "Learn SQL joins.",
        "format": "article",
        "url": f"https://example.com/{rid}",
        "checked_at": "2026-11-14T12:00:00Z",
    }


def snapshot():
    return {
        "workflow_id": "search",
        "analysis_id": "analysis",
        "goal_id": "goal",
        "skill": "SQL",
        "free": [resource()],
        "paid": [resource("paid-id", "paid")],
        "mixed": [],
        "unknown": [],
    }


def plan(mode="text"):
    return {
        "learning_outcome": "Combine two tables using a left join.",
        "milestones": [
            {
                "title": "Join tables",
                "mode": mode,
                "instruction": "Compare inner and left join results.",
                "success_criteria": ["Explain unmatched rows."],
                "resource_ids": ["free-id", "paid-id"],
            }
        ],
    }


@pytest.mark.parametrize("mode", ["text", "hands_on", "both"])
def test_modalities_and_selected_resource_boundary(mode):
    output = plan("text" if mode == "both" else mode)
    if mode == "both":
        output["milestones"].append(plan("hands_on")["milestones"][0])
    data = {"modality": mode, "resources": [resource(), resource("paid-id", "paid")]}
    assert plan_supported(output, data)
    bad = copy.deepcopy(output)
    bad["milestones"][0]["resource_ids"].append("invented")
    assert not plan_supported(bad, data)
    bad["milestones"][0]["resource_ids"] = ["free-id", "free-id"]
    assert not plan_supported(bad, data)
    if mode == "both":
        assert not plan_supported(plan(), data)
    else:
        assert not plan_supported(plan("hands_on" if mode == "text" else "text"), data)


def setup_store(monkeypatch):
    monkeypatch.setattr(store.users, "get_user", lambda uid: {"consent_at": "yes"})
    states, paths = {}, {}
    monkeypatch.setattr(store, "get_resource_search_flow", lambda user, sid: snapshot())
    monkeypatch.setattr(
        store.profiles,
        "get_latest_profile",
        lambda uid: {"id": "profile", "confirmed_at": "yes"},
    )
    monkeypatch.setattr(
        store.profiles,
        "list_skill_evidence",
        lambda pid: [{"skills": {"canonical_name": "Python"}}],
    )
    monkeypatch.setattr(
        store.users, "create_workflow", lambda *args: {"id": "plan-workflow"}
    )
    monkeypatch.setattr(
        store.users,
        "save_workflow_state",
        lambda wid, phase, data: states.update({wid: copy.deepcopy(data)}),
    )
    monkeypatch.setattr(store, "load_routing", lambda path: {"revision": "pinned"})

    def create(goal, skill, objective, milestones):
        paths["path"] = {
            "id": "path",
            "goal_id": goal,
            "objective": objective,
            "milestones_json": milestones,
            "status": "proposed",
        }
        return paths["path"]

    monkeypatch.setattr(store.learning, "create_path", create)
    monkeypatch.setattr(store.learning, "get_path", lambda pid: paths.get(pid))
    monkeypatch.setattr(
        store.learning,
        "update_path_status",
        lambda pid, status: paths[pid].update(status=status),
    )
    monkeypatch.setattr(store.users, "get_goal", lambda gid: {"user_id": "user"})
    monkeypatch.setattr(
        store.users,
        "get_path_workflow",
        lambda uid, pid: {"state_json": states["plan-workflow"]},
    )
    return states, paths


def test_goal_resources_snapshot_reload_acceptance_no_rubric(monkeypatch):
    states, paths = setup_store(monkeypatch)
    calls = []

    def generate(state, data):
        calls.append(data)
        assert state["model_routing"]["revision"] == "pinned"
        return plan()

    monkeypatch.setattr(store, "propose_path", generate)
    rubric = MagicMock()
    monkeypatch.setattr(store.mastery, "create_rubric", rubric)
    goal = "Use left joins to combine customer and order data."
    saved = store.generate_path_flow(
        "user", "search", goal, "text", ["free-id", "paid-id"]
    )
    assert saved["objective"] == goal == paths["path"]["objective"]
    assert saved["resources"] == snapshot()["free"] + snapshot()["paid"]
    assert calls[0]["confirmed_skills"] == ["Python"]
    assert saved["rubric"] is None and not saved["assessment_available"]
    assert store.get_path_flow("path", "user") == saved
    assert store.approve_path_flow("path", "user")["status"] == "approved"
    assert store.approve_path_flow("path", "user")["status"] == "approved"
    assert len(calls) == 1
    rubric.assert_not_called()
    with pytest.raises(ApiError) as exc:
        store.start_assessment_flow("user", "path", None)
    assert exc.value.code == "assessment_unavailable"
    assert (
        states["plan-workflow"]["result"]["status"] == "proposed"
    )  # immutable snapshot
    with pytest.raises(ApiError) as exc:
        store.get_path_flow("path", "other")
    assert exc.value.status_code == 404


@pytest.mark.parametrize("ids", [["invented"], ["free-id", "free-id"]])
def test_reject_invalid_selection_before_model(monkeypatch, ids):
    setup_store(monkeypatch)
    generate = MagicMock()
    monkeypatch.setattr(store, "propose_path", generate)
    with pytest.raises(ApiError) as exc:
        store.generate_path_flow("user", "search", "Learn SQL joins.", "text", ids)
    assert exc.value.status_code == 422
    generate.assert_not_called()


def test_provider_failure_leaves_resources_and_no_plan(monkeypatch):
    states, paths = setup_store(monkeypatch)
    monkeypatch.setattr(
        store, "propose_path", MagicMock(side_effect=ModelError("refused"))
    )
    with pytest.raises(ApiError) as exc:
        store.generate_path_flow(
            "user", "search", "Learn SQL joins.", "both", ["free-id"]
        )
    assert exc.value.status_code == 503
    assert not paths and states["plan-workflow"]["status"] == "failed"
    assert states["plan-workflow"]["error"] == "refused"


def test_goal_validation_and_authentication():
    with pytest.raises(ValidationError):
        main.GeneratePathBody(
            resource_search_id="search",
            learning_goal=" " * 20,
            modality="text",
            resource_ids=["free-id"],
        )
    main.app.dependency_overrides[main.current_user_id] = lambda: "user"
    try:
        client = TestClient(main.app)
        for extra in (
            {"learning_goal": ""},
            {"modality": "video"},
            {"resource_ids": []},
            {"template_id": "ignored?"},
        ):
            body = {
                "resource_search_id": "search",
                "learning_goal": "Learn SQL joins.",
                "modality": "text",
                "resource_ids": ["free-id"],
                **extra,
            }
            assert client.post("/api/paths/generate", json=body).status_code == 422
    finally:
        main.app.dependency_overrides.clear()
    assert TestClient(main.app).get("/api/paths/some-path").status_code in (401, 403)


@pytest.mark.parametrize(
    "kind,quote,valid",
    [
        ("free", "Free access.", True),
        ("paid", "Price: $20.", True),
        ("free", "Free trial.", False),
        ("unknown", "", True),
        ("paid", "Free access.", False),
    ],
)
def test_resource_price_evidence(kind, quote, valid):
    item = resource()
    item = {k: v for k, v in item.items() if k not in ("id", "url", "checked_at")}
    item.update(page_index=0, price_type=kind, price_evidence=quote)
    data = {"pages": [{"content": "SQL joins\nLearn SQL joins.\n" + quote}]}
    assert resource_source_supported({"resources": [item]}, data) == valid
    assert not resource_source_supported(
        {"resources": [{**item, "learning_evidence": "Invented coverage"}]}, data
    )
    assert not resource_source_supported(
        {"resources": [{**item, "page_index": -1}]}, data
    )


@pytest.mark.parametrize("markup", ["*", "**", "_", "__", "`", "``"])
def test_resource_evidence_accepts_rendered_markdown(markup):
    item = {"page_index": 0, "title": "SQL joins", "learning_evidence": "Learn SQL joins.",
            "price_type": "free", "price_evidence": "Free access.", "format": "course"}
    data = {"pages": [{"content": f"# SQL {markup}joins{markup}\nLearn {markup}SQL\u0020joins.{markup}\n\nFree\naccess."}]}
    assert resource_source_supported({"resources": [item]}, data)
    for field, invented in (("title", "Advanced SQL joins"),
                            ("learning_evidence", "Learn SQL joins and optimization."),
                            ("price_evidence", "Free certificate.")):
        assert not resource_source_supported({"resources": [{**item, field: invented}]}, data)
    assert not resource_source_supported({"resources": [{**item, "price_type": "paid"}]}, data)


def test_resource_evidence_preserves_identifiers_and_meaning():
    item = {"page_index": 0, "title": "SQL course", "learning_evidence": "Use customer_id.",
            "price_type": "unknown", "price_evidence": "", "format": "course"}
    data = {"pages": [{"content": "SQL course\nUse `customer_id`.\nThis is not free."}]}
    assert resource_source_supported({"resources": [item]}, data)
    assert not resource_source_supported({"resources": [{**item, "learning_evidence": "Use customerid."}]}, data)
    assert not resource_source_supported({"resources": [{**item, "learning_evidence": "This is free."}]}, data)


def test_searches_both_prices_and_preserves_empty_results(monkeypatch):
    queries = []
    monkeypatch.setattr(search_agent, "search", lambda q, n: queries.append(q) or [])
    monkeypatch.setattr(search_agent, "fetch_pages", lambda *args: [])
    assert search_agent.find_resources({"skill": "SQL"}) == {"pages": []}
    assert len(queries) == 2 and "free" in queries[0] and "paid" in queries[1]
    result = search_agent.analyze_resources({"skill": "SQL", "pages": []})["result"]
    assert all(result[k] == [] for k in ("free", "paid", "mixed", "unknown"))


def test_resource_snapshot_owned_and_saved(monkeypatch):
    monkeypatch.setattr(store.users, "get_user", lambda uid: {"consent_at": "yes"})
    result = snapshot()
    monkeypatch.setattr(
        store,
        "get_gap_analysis_flow",
        lambda aid, uid: {"goal_id": "goal", "gaps": [{"skill": "SQL"}]},
    )
    monkeypatch.setattr(store.users, "create_workflow", lambda *args: {"id": "search"})
    states = []
    monkeypatch.setattr(
        store.users,
        "save_workflow_state",
        lambda wid, phase, state: states.append(copy.deepcopy(state)),
    )
    monkeypatch.setattr(store, "load_routing", lambda path: {"revision": "pinned"})
    monkeypatch.setattr(
        store.resource_search_agent, "invoke", lambda state: {"result": result}
    )
    saved = []
    monkeypatch.setattr(
        store.learning,
        "add_resource",
        lambda skill, r: saved.append(r) or {"id": r["price_type"] + "-id"},
    )
    monkeypatch.setattr(store.learning, "mark_resource_verified", lambda rid: {})
    actual = store.discover_resources_flow("user", "analysis", "sql")
    assert {r["price_type"] for r in saved} == {"free", "paid"}
    monkeypatch.setattr(
        store.users,
        "get_workflow",
        lambda wid: {"user_id": "user", "state_json": states[-1]},
    )
    assert store.get_resource_search_flow("user", "search") == actual
    with pytest.raises(ApiError) as exc:
        store.get_resource_search_flow("other", "search")
    assert exc.value.status_code == 404


def test_learning_requires_processing_consent(monkeypatch):
    monkeypatch.setattr(store.users, "get_user", lambda uid: {"consent_at": None})
    for action in (lambda: store.discover_resources_flow("user", "analysis", "SQL"),
                   lambda: store.generate_path_flow("user", "search", "Learn SQL joins.", "text", ["resource"])):
        with pytest.raises(ApiError) as exc:
            action()
        assert exc.value.status_code == 403
