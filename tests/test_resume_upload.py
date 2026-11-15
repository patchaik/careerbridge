import copy
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from careerbridge import analyst, store
from careerbridge.errors import ApiError
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.career_analyst import source_supported
from database.client import DBError


@pytest.mark.parametrize(
    "skill",
    [
        {"name": "SQL", "evidence": "Invented evidence"},
        {"name": "Kubernetes", "evidence": "I used SQL."},
        {"name": " ", "evidence": "I used SQL."},
    ],
)
def test_rejects_unsupported_skills(skill):
    assert not source_supported({"skills": [skill]}, {"source": "I used SQL."})


def test_rejects_duplicates_and_accepts_empty_evidence_set():
    skill = {"name": "SQL", "evidence": "I used SQL."}
    assert not source_supported({"skills": [skill, skill]}, {"source": "I used SQL."})
    assert source_supported({"skills": []}, {"source": "No skills listed."})


@pytest.mark.parametrize("audit_fails", [False, True])
def test_analyst_uses_gateway_context_and_durable_audit(monkeypatch, audit_fails):
    monkeypatch.setenv("CAREERBRIDGE_ANALYST_MODE", "llm")
    state = {
        "text": "I used SQL.",
        "workflow_id": str(uuid4()),
        "user_id": str(uuid4()),
        "model_routing": {"revision": "pinned", "config": {"timeout_seconds": 60}},
    }
    audit = MagicMock(return_value={"id": "stored"})
    if audit_fails:
        audit.side_effect = DBError("not written")
    monkeypatch.setattr(analyst.users, "log_event", audit)
    gateway = MagicMock()

    def factory(routing, suite, record):
        assert routing == state["model_routing"]

        def generate(task, schema_id, data, context, *, validate_business):
            assert task == "profile_extract" and schema_id == "resume_skills"
            assert context.workflow_id == state["workflow_id"]
            assert context.user_id == state["user_id"]
            assert context.allowed_fallback_profiles == ()
            assert context.prompt_version == suite["tasks"][task]["prompt_version"]
            result = {
                "skills": [
                    {"name": "SQL", "category": "technical", "evidence": "I used SQL."}
                ]
            }
            assert validate_business(result, data)
            record({"id": "invocation", "status": "succeeded"})
            return {"validated_data": result, "invocation_id": "invocation"}

        gateway.generate_json.side_effect = generate
        return gateway

    monkeypatch.setattr(analyst, "ModelGateway", factory)
    if audit_fails:
        with pytest.raises(ModelError, match="invocation_not_recorded"):
            analyst.extract_skills(state)
    else:
        result = analyst.extract_skills(state)
        assert result["skills"][0]["source"] == "resume"
        assert result["invocation_id"] == "invocation"
        audit.assert_called_once_with(
            state["user_id"],
            "model_invocation",
            "workflow",
            state["workflow_id"],
            {"id": "invocation", "status": "succeeded"},
        )
    gateway.close.assert_called_once()


def test_model_failure_keeps_one_workflow_and_writes_no_profile(monkeypatch):
    monkeypatch.setenv("CAREERBRIDGE_ANALYST_MODE", "llm")
    monkeypatch.setattr(store.users, "get_user", lambda _: {"consent_at": "set"})
    create = MagicMock(return_value={"id": str(uuid4())})
    monkeypatch.setattr(store.users, "create_workflow", create)
    states = []
    monkeypatch.setattr(
        store.users,
        "save_workflow_state",
        lambda wid, phase, state: states.append((wid, copy.deepcopy(state))),
    )
    monkeypatch.setattr(store, "resume_routing", lambda: {"revision": "pinned"})
    monkeypatch.setattr(
        store.analyst, "invoke", MagicMock(side_effect=ModelError("refused"))
    )
    profile = MagicMock()
    monkeypatch.setattr(store.profiles, "create_profile", profile)
    with pytest.raises(ApiError) as error:
        store.parse_resume_flow(str(uuid4()), b"synthetic", "resume.docx")
    assert error.value.status_code == 503
    create.assert_called_once()
    assert [state["status"] for _, state in states] == ["running", "failed"]
    assert states[0][0] == states[1][0]
    assert states[1][1]["error"] == "refused"
    profile.assert_not_called()


def test_consent_required_before_extraction(monkeypatch):
    monkeypatch.setattr(store.users, "get_user", lambda _: {"consent_at": None})
    create = MagicMock()
    monkeypatch.setattr(store.users, "create_workflow", create)
    with pytest.raises(ApiError) as error:
        store.parse_resume_flow(str(uuid4()), b"synthetic", "resume.docx")
    assert error.value.status_code == 403
    create.assert_not_called()


def test_explicit_mock_mode_does_not_use_gateway(monkeypatch):
    monkeypatch.setenv("CAREERBRIDGE_ANALYST_MODE", "mock")
    gateway = MagicMock()
    monkeypatch.setattr(analyst, "ModelGateway", gateway)
    result = analyst.extract_skills({"text": "I used SQL."})
    assert result["skills"][0]["name"] == "SQL"
    assert result["invocation_id"] is None
    gateway.assert_not_called()
