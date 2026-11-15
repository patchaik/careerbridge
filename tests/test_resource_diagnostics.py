import copy
import json

import pytest

from careerbridge import search_agent, store
from careerbridge.errors import ApiError
from careerbridge.model_gateway import ModelError
from careerbridge.prompts.resources import resource_source_supported, resource_validation_issues


def fixture():
    item = {"page_index": 0, "title": "PyTorch course", "format": "course", "price_type": "free",
            "learning_evidence": "Learn PyTorch.",
            "price_evidence": "Read the course materials online for free at learnpytorch.io."}
    data = {"pages": [{"content": "PyTorch course\nLearn **PyTorch**.\n"
            "Read the course materials online for free at [learnpytorch.io](https://learnpytorch.io/)."}]}
    return item, data


def test_rendered_link_evidence_regression():
    item, data = fixture()
    assert resource_source_supported({"resources": [item]}, data)
    # A destination URL is not rendered evidence; changing meaning still fails.
    for evidence in ("Free certificate at learnpytorch.io.", "https://learnpytorch.io/"):
        invalid = {"resources": [{**item, "price_evidence": evidence}]}
        issues = resource_validation_issues(invalid, data)
        assert {"resource_index": 0, "page_index": 0, "field": "price_evidence", "reason": "not_in_source"} in issues
        assert evidence not in json.dumps(issues)


def test_extraction_records_each_validation_attempt(monkeypatch):
    item, data = fixture()
    state = {"skill": "PyTorch", "pages": [{**data["pages"][0], "url": "https://example.com/course"}], "diagnostics": {}}
    def generate(_state, _suite, _task, _schema, source, check):
        with pytest.raises(ModelError) as caught:
            check({"resources": [{**item, "learning_evidence": "Invented private text"}]}, source)
        assert caught.value.diagnostics["issues"][0]["field"] == "learning_evidence"
        assert check({"resources": [item]}, source)
        return {"resources": [item]}
    monkeypatch.setattr(search_agent, "generate_task", generate)
    result = search_agent.analyze_resources(state)
    assert len(result["result"]["free"]) == 1
    attempts = state["diagnostics"]["validation_attempts"]
    assert attempts[0]["issues"][0]["field"] == "learning_evidence"
    assert attempts[1]["issues"] == []
    assert "Invented private text" not in json.dumps(state["diagnostics"])


@pytest.mark.parametrize("stage,code,message", [
    ("search", "provider_unavailable", "search service"),
    ("fetch", "source_fetch_failed", "pages could not be read"),
    ("extraction", "invalid_output", "could not be verified"),
    ("extraction", "capability_unavailable", "not configured"),
    ("save", "save_failed", "could not be saved"),
])
def test_failure_diagnostics_and_safe_user_message(monkeypatch, stage, code, message):
    states = []
    monkeypatch.setattr(store, "require_learning_consent", lambda *_: None)
    monkeypatch.setattr(store, "get_gap_analysis_flow", lambda *_: {"goal_id": "g", "gaps": [{"skill": "PyTorch"}]})
    monkeypatch.setattr(store.users, "create_workflow", lambda *_: {"id": "reference-123"})
    monkeypatch.setattr(store.users, "save_workflow_state", lambda _id, _phase, s: states.append(copy.deepcopy(s)))
    monkeypatch.setattr(store, "load_routing", lambda *_: {})
    def fail(state):
        state["diagnostics"]["stage"] = stage
        raise ModelError(code, {"reason": "schema_validation", "validator": "maxLength"})
    monkeypatch.setattr(store.resource_search_agent, "invoke", fail)
    with pytest.raises(ApiError) as caught:
        store.discover_resources_flow("user", "analysis", "PyTorch")
    assert caught.value.status_code == 503
    assert message in caught.value.message and "reference-123" in caught.value.message
    assert states[-1]["diagnostics"]["stage"] == stage
    assert states[-1]["diagnostics"]["model_validation"]["validator"] == "maxLength"
    assert states[-1]["status"] == "failed"
