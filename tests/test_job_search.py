import copy
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from careerbridge import search_agent, store, model_tasks
from careerbridge.errors import ApiError
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.search_agent import job_source_supported
from database.client import DBError


def valid_job():
    return {
        "page_index": 0,
        "title": "Data Analyst",
        "employer": "Acme",
        "requirements": [
            {"skill": "SQL", "importance": "required", "excerpt": "Required: SQL."}
        ],
    }


@pytest.mark.parametrize(
    "change",
    [
        {"page_index": -1},
        {"page_index": 1},
        {"title": "Invented"},
        {"employer": "Invented"},
        {
            "requirements": [
                {
                    "skill": "Docker",
                    "importance": "required",
                    "excerpt": "Required: SQL.",
                }
            ]
        },
        {
            "requirements": [
                {
                    "skill": "SQL",
                    "importance": "required",
                    "excerpt": "Invented SQL quote",
                }
            ]
        },
    ],
)
def test_rejects_unsupported_job_evidence(change):
    job = valid_job() | change
    assert not job_source_supported(
        {"jobs": [job]}, {"pages": [{"content": "Acme Data Analyst. Required: SQL."}]}
    )


def test_valid_and_empty_evidence():
    data = {"pages": [{"content": "Acme Data Analyst. Required: SQL."}]}
    assert job_source_supported({"jobs": [valid_job()]}, data)
    assert job_source_supported({"jobs": []}, data)
    assert not job_source_supported({"jobs": [valid_job(), valid_job()]}, data)


@pytest.mark.parametrize("literal,paraphrase,excerpt", [
    ("Business Analyst", "Business Analyst experience", "Three years of experience as a Business Analyst."),
    ("Agile", "Agile delivery methodologies", "Experience working in Agile, Lean-Agile, or hybrid delivery environments."),
    ("problem-solving", "Analytical and problem-solving skills", "Strong analytical, problem-solving, and communication skills."),
    ("analyzing business processes", "Business process analysis", "Experience in analyzing business processes and developing solutions."),
])
def test_job_skills_must_be_literal_excerpt_substrings(literal, paraphrase, excerpt):
    job = valid_job()
    data = {"pages": [{"content": "Acme Data Analyst. " + excerpt}]}
    job["requirements"] = [{"skill": literal, "importance": "required", "excerpt": excerpt}]
    assert job_source_supported({"jobs": [job]}, data)
    job["requirements"][0]["skill"] = paraphrase
    assert not job_source_supported({"jobs": [job]}, data)


@pytest.mark.parametrize("audit_fails", [False, True])
def test_gateway_uses_pinned_context_and_audit(monkeypatch, audit_fails):
    state = {
        "role": "Data Analyst",
        "location": "",
        "seniority": "",
        "pages": [{"content": "Acme Data Analyst. Required: SQL."}],
        "workflow_id": str(uuid4()),
        "user_id": str(uuid4()),
        "model_routing": {"revision": "pinned", "config": {"timeout_seconds": 60}},
    }
    audit = MagicMock(
        return_value={"id": "saved"},
        side_effect=DBError("failed") if audit_fails else None,
    )
    monkeypatch.setattr(model_tasks.users, "log_event", audit)
    gateway = MagicMock()

    def factory(routing, suite, record):
        assert routing is state["model_routing"]

        def generate(task, schema_id, data, ctx, *, validate_business):
            assert (task, schema_id) == ("job_extract", "job_requirements")
            assert (
                ctx.workflow_id == state["workflow_id"]
                and ctx.routing_revision == "pinned"
            )
            assert ctx.allowed_fallback_profiles == ()
            assert "skills" not in data
            output = {"jobs": [valid_job()]}
            assert validate_business(output, data)
            record({"status": "succeeded"})
            return {"validated_data": output}

        gateway.generate_json.side_effect = generate
        return gateway

    monkeypatch.setattr(model_tasks, "ModelGateway", factory)
    if audit_fails:
        with pytest.raises(ModelError, match="invocation_not_recorded"):
            search_agent.extract_jobs(state)
    else:
        assert search_agent.extract_jobs(state).jobs[0].title == "Data Analyst"
    gateway.close.assert_called_once()


def setup_store(monkeypatch):
    monkeypatch.setenv("CAREERBRIDGE_SEARCH_MODE", "live")
    monkeypatch.setattr(
        store.profiles,
        "get_latest_profile",
        lambda _: {"id": "profile", "confirmed_at": "yes"},
    )
    monkeypatch.setattr(store.users, "create_workflow", lambda *a: {"id": "wf"})
    states = []
    monkeypatch.setattr(
        store.users,
        "save_workflow_state",
        lambda wid, phase, data: states.append(copy.deepcopy(data)),
    )
    monkeypatch.setattr(store, "load_routing", lambda path: {"revision": "pinned"})
    return states


def test_failed_search_records_one_workflow_and_no_postings(monkeypatch):
    states = setup_store(monkeypatch)
    monkeypatch.setattr(
        store.job_search_agent, "invoke", MagicMock(side_effect=ModelError("refused"))
    )
    save = MagicMock()
    monkeypatch.setattr(store.jobs, "upsert_job_posting", save)
    with pytest.raises(ApiError) as exc:
        store.search_jobs_flow(
            "user", {"id": "goal", "user_id": "user", "target_role": "Analyst"}, 5
        )
    assert exc.value.status_code == 503
    assert [s["status"] for s in states] == ["running", "failed"]
    assert states[0]["model_routing"]["revision"] == "pinned"
    save.assert_not_called()


def test_unknown_importance_is_not_relabelled(monkeypatch):
    setup_store(monkeypatch)
    job = {
        "title": "Analyst",
        "url": "https://example.com/job",
        "retrieved_at": "2026-11-15",
        "requirements": [
            {"skill": "SQL", "importance": "unspecified", "excerpt": "SQL"}
        ],
    }
    monkeypatch.setattr(
        store.job_search_agent,
        "invoke",
        lambda _: {"result": {"source": "keenable", "jobs": [job]}},
    )
    save = MagicMock()
    monkeypatch.setattr(store.jobs, "upsert_job_posting", save)
    result = store.search_jobs_flow(
        "user", {"id": "goal", "user_id": "user", "target_role": "Analyst"}, 5
    )
    assert result["jobs"] == [] and not result["fallback_used"]
    save.assert_not_called()


@pytest.mark.parametrize("confirmed", [None, "yes"])
def test_search_requires_owned_goal_and_confirmed_profile(monkeypatch, confirmed):
    monkeypatch.setattr(
        store.profiles, "get_latest_profile", lambda _: {"confirmed_at": confirmed}
    )
    with pytest.raises(ApiError):
        store.search_jobs_flow(
            "user", {"id": "goal", "user_id": "other" if confirmed else "user"}, 5
        )


@pytest.mark.parametrize("owner,confirmed", [("other", "yes"), ("user", None)])
def test_gap_analysis_checks_profile_before_reading_evidence(
    monkeypatch, owner, confirmed
):
    monkeypatch.setattr(store.users, "get_goal", lambda _: {"user_id": "user"})
    monkeypatch.setattr(
        store.profiles,
        "get_profile",
        lambda _: {"user_id": owner, "confirmed_at": confirmed},
    )
    evidence = MagicMock()
    monkeypatch.setattr(store.profiles, "list_skill_evidence", evidence)
    with pytest.raises(ApiError):
        store.analyze_skills_flow("user", "goal", "profile", ["job"])
    evidence.assert_not_called()


def test_gap_reload_is_owner_scoped(monkeypatch):
    monkeypatch.setattr(store.jobs, "get_gap_analysis", lambda _: {"goal_id": "goal"})
    monkeypatch.setattr(store.users, "get_goal", lambda _: {"user_id": "other"})
    with pytest.raises(ApiError):
        store.get_gap_analysis_flow("analysis", "user")


def test_fetch_failure_is_not_empty_success(monkeypatch):
    monkeypatch.setenv("CAREERBRIDGE_SEARCH_MODE", "live")
    monkeypatch.setattr(
        search_agent, "search", lambda *a: [{"url": "https://example.com/job"}]
    )
    monkeypatch.setattr(search_agent, "fetch_pages", lambda *a: [])
    with pytest.raises(ModelError, match="source_fetch_failed"):
        search_agent.find_jobs({"role": "Nurse", "location": "London", "seniority": ""})
