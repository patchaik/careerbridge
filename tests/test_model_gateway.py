import copy
import json
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest
import yaml

from careerbridge.model_gateway import (
    ADAPTER_VERSION,
    ExecutionContext,
    ModelError,
    ModelGateway,
    contract_schema,
    digest,
    pin_routing,
    utcnow,
    validate,
)

INPUT = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"source": {"type": "string"}},
    "required": ["source"],
}
OUTPUT = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"excerpt": {"type": "string"}},
    "required": ["excerpt"],
}
SUITE = {
    "tasks": {
        "profile_extract": dict(
            prompt="Extract an exact source excerpt. Return empty excerpt when absent.",
            prompt_version="extract-v1",
            output_schema_version="excerpt-v1",
            schema_id="excerpt",
            input_schema=INPUT,
            output_schema=OUTPUT,
            max_input_tokens=4096,
            max_output_tokens=128,
        )
    },
    "cases": [],
}


def response(content='{"excerpt":"SQL"}', *, finish="stop", refusal=None):
    return dict(
        model="returned-model",
        choices=[
            dict(finish_reason=finish, message=dict(content=content, refusal=refusal))
        ],
        usage=dict(prompt_tokens=12, completion_tokens=8),
    )


@pytest.fixture
def setup(tmp_path):
    config = yaml.safe_load(open("contracts/v0.1/model-routing.example.yaml"))
    env = {
        "OPENAI_MODEL": "openai-test",
        "NEBIUS_MODEL": "nebius-test",
        "OPENAI_API_KEY": "secret-openai",
        "NEBIUS_API_KEY": "secret-nebius",
    }
    for name, p in config["profiles"].items():
        p["capability_report_path"] = str(tmp_path / f"{name}.json")
        report = dict(
            schema_version="1.0",
            provider=name,
            base_url=p["base_url"],
            model=env[p["model_env"]],
            adapter_version=ADAPTER_VERSION,
            structured_mode=p["structured_mode"],
            tested_at=(utcnow() - timedelta(minutes=1)).isoformat(),
            expires_at=(utcnow() + timedelta(days=1)).isoformat(),
            fixture_suite_sha256=digest(SUITE),
            max_input_tokens=4096,
            max_output_tokens=128,
            checks={
                k: True
                for k in contract_schema("model-capability-report")["properties"][
                    "checks"
                ]["required"]
            },
            passed=True,
        )
        # Synthetic reports exist ONLY in tmp_path and are never deployable artifacts.
        open(p["capability_report_path"], "w").write(json.dumps(report))
    return config, env


def gateway(setup, handler, *, suite=None):
    config, env = setup
    events = []
    calls = []

    def transport(req):
        calls.append(req)
        return handler(req)

    g = ModelGateway(
        pin_routing(config, env),
        suite or SUITE,
        events.append,
        env=env,
        client=httpx.Client(transport=httpx.MockTransport(transport)),
        sleep=lambda _: None,
    )
    ctx = ExecutionContext(
        str(uuid4()),
        str(uuid4()),
        g.revision,
        "extract-v1",
        "excerpt-v1",
        utcnow() + timedelta(seconds=90),
    )
    return g, ctx, events, calls


def generate(g, ctx, source="SQL"):
    return g.generate_json(
        "profile_extract",
        "excerpt",
        {"source": source},
        ctx,
        validate_business=lambda output, data: output["excerpt"] in data["source"],
    )


@pytest.mark.parametrize("provider", ["nebius", "openai"])
def test_same_contract_and_redacted_metadata(setup, provider):
    setup[0]["active_profile"] = provider
    g, ctx, events, calls = gateway(
        setup,
        lambda r: httpx.Response(
            200, json=response(), headers={"x-request-id": "req1"}
        ),
    )
    assert generate(g, ctx)["validated_data"] == {"excerpt": "SQL"}
    assert len(calls) == 1 and provider in str(calls[0].url)
    event = events[0]
    validate(contract_schema("model-invocation"), event)
    assert event["provider"] == provider and event["returned_model"] == "returned-model"
    assert event["status"] == "succeeded" and event["provider_request_id"] == "req1"
    assert "SQL" not in json.dumps(event) and "secret" not in json.dumps(event)
    payload = json.loads(calls[0].content)
    assert (
        payload["messages"][1]["role"] == "user"
        and payload["response_format"]["type"] == "json_schema"
    )
    assert "tools" not in payload


@pytest.mark.parametrize(
    "problem",
    [
        "missing",
        "expired",
        "future",
        "model",
        "adapter",
        "suite",
        "failed",
        "check",
        "tokens",
    ],
)
def test_capability_gate_makes_no_call(setup, problem):
    config, _ = setup
    p = config["profiles"]["nebius"]["capability_report_path"]
    r = json.load(open(p))
    if problem == "missing":
        from pathlib import Path

        Path(p).unlink()
    else:
        if problem == "expired":
            r["expires_at"] = (utcnow() - timedelta(seconds=1)).isoformat()
        if problem == "future":
            r["tested_at"] = (utcnow() + timedelta(days=1)).isoformat()
        if problem == "model":
            r["model"] = "other"
        if problem == "adapter":
            r["adapter_version"] = "other"
        if problem == "suite":
            r["fixture_suite_sha256"] = "0" * 64
        if problem == "failed":
            r["passed"] = False
        if problem == "check":
            r["checks"]["source_validation"] = False
        if problem == "tokens":
            r["max_output_tokens"] = 1
        open(p, "w").write(json.dumps(r))
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response())
    )
    with pytest.raises(ModelError, match="capability_unavailable"):
        generate(g, ctx)
    assert not calls


@pytest.mark.parametrize(
    "body,code",
    [
        (response(refusal="No"), "refused"),
        (response(finish="length"), "incomplete"),
        (response(finish="content_filter"), "refused"),
        (response(finish="tool_calls"), "incomplete"),
    ],
)
def test_refusal_and_incomplete_are_not_retried(setup, body, code):
    g, ctx, events, calls = gateway(setup, lambda r: httpx.Response(200, json=body))
    with pytest.raises(ModelError, match=code):
        generate(g, ctx)
    assert len(calls) == 1 and events[0]["status"] == code


@pytest.mark.parametrize(
    "content", ["not json", '{"excerpt":"fabricated"}', '{"unexpected":true}']
)
def test_schema_and_business_failure_one_repair(setup, content):
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response(content))
    )
    with pytest.raises(ModelError, match="invalid_output"):
        generate(g, ctx)
    assert len(calls) == 2 and all(e["status"] == "invalid_output" for e in events)


def test_repair_can_succeed(setup):
    bodies = iter([response("bad"), response()])
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=next(bodies))
    )
    assert generate(g, ctx)["validated_data"] == {"excerpt": "SQL"}
    assert [e["status"] for e in events] == ["invalid_output", "succeeded"]


def test_business_diagnostics_are_sent_to_bounded_repair(setup):
    g, ctx, events, calls = gateway(setup, lambda _: httpx.Response(200, json=response()))
    attempts = []
    def check(output, data):
        attempts.append(output)
        if len(attempts) == 1:
            raise ModelError("invalid_output", {"reason": "source_validation", "field": "price_evidence"})
        return True
    g.generate_json("profile_extract", "excerpt", {"source": "SQL"}, ctx, validate_business=check)
    assert len(calls) == 2
    repair = json.loads(calls[1].content)["messages"][-1]["content"]
    assert "price_evidence" in repair and "source_validation" in repair
    assert [e["status"] for e in events] == ["invalid_output", "succeeded"]


@pytest.mark.parametrize("status", [401, 403, 400, 302])
def test_permanent_error_never_falls_back(setup, status):
    setup[0]["cross_provider_fallback"] = {
        "enabled": True,
        "allowed_profiles": ["openai"],
    }
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(status, json={"secret": "do not log"})
    )
    ctx = ExecutionContext(**{**ctx.__dict__, "allowed_fallback_profiles": ("openai",)})
    with pytest.raises(ModelError, match="provider_request_rejected"):
        generate(g, ctx)
    assert len(calls) == 1 and events[0]["provider"] == "nebius"


@pytest.mark.parametrize(
    "enabled,consent,expected",
    [(False, True, "nebius"), (True, False, "nebius"), (True, True, "openai")],
)
def test_fallback_requires_config_and_consent(setup, enabled, consent, expected):
    setup[0]["cross_provider_fallback"] = {
        "enabled": enabled,
        "allowed_profiles": ["openai"],
    }
    count = 0

    def handle(r):
        nonlocal count
        count += 1
        return (
            httpx.Response(503) if count == 1 else httpx.Response(200, json=response())
        )

    g, ctx, events, calls = gateway(setup, handle)
    ctx = ExecutionContext(
        **{**ctx.__dict__, "allowed_fallback_profiles": ("openai",) if consent else ()}
    )
    generate(g, ctx)
    assert [e["provider"] for e in events] == ["nebius", expected]


def test_routing_is_pinned_and_prompt_changes_invalidate_suite(setup):
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response())
    )
    setup[0]["active_profile"] = "openai"
    setup[1]["NEBIUS_MODEL"] = "new-model"
    generate(g, ctx)
    assert events[0]["requested_model"] == "nebius-test"
    suite = copy.deepcopy(SUITE)
    suite["tasks"]["profile_extract"]["prompt"] += " Changed."
    g2, ctx2, _, calls2 = gateway(
        setup, lambda r: httpx.Response(200, json=response()), suite=suite
    )
    with pytest.raises(ModelError, match="capability_unavailable"):
        generate(g2, ctx2)
    assert not calls2


def test_retry_after_exceeding_deadline_does_not_sleep_or_fallback(setup):
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(429, headers={"retry-after": "3600"})
    )
    g.sleep = lambda _: pytest.fail("Should not sleep beyond deadline")
    with pytest.raises(ModelError, match="deadline_exceeded"):
        generate(g, ctx)
    assert len(calls) == 1


def test_timeout_retries_are_bounded(setup):
    def timeout(r):
        raise httpx.ReadTimeout("raw sensitive provider text", request=r)

    g, ctx, events, calls = gateway(setup, timeout)
    with pytest.raises(ModelError, match="provider_unavailable"):
        generate(g, ctx)
    assert len(calls) == 3 and len(events) == 3
    assert "sensitive" not in json.dumps(events)


def test_unsafe_tasks_and_invalid_input_do_not_call_provider(setup):
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response())
    )
    with pytest.raises(ModelError):
        g.generate_text("grade", {}, ctx, validate_business=lambda *_: True)
    with pytest.raises(Exception):
        g.generate_json(
            "profile_extract",
            "excerpt",
            {"source": "SQL", "grading_secret": "x"},
            ctx,
            validate_business=lambda *_: True,
        )
    with pytest.raises(ModelError, match="input_too_large"):
        generate(g, ctx, "x" * 5000)
    assert not calls


def test_invocation_storage_failure_does_not_return_success(setup):
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response())
    )

    def broken_sink(event):
        raise RuntimeError("storage unavailable")

    g.record = broken_sink
    with pytest.raises(RuntimeError, match="storage unavailable"):
        generate(g, ctx)


def test_text_generation_and_explicit_json_object_mode(setup):
    # Both output paths use the same transport and report gate.
    suite = copy.deepcopy(SUITE)
    suite["tasks"]["tutor"] = {
        **suite["tasks"]["profile_extract"],
        "output_schema": None,
        "schema_id": None,
    }
    for profile in setup[0]["profiles"].values():
        report = json.load(open(profile["capability_report_path"]))
        report["fixture_suite_sha256"] = digest(suite)
        open(profile["capability_report_path"], "w").write(json.dumps(report))
    g, ctx, events, calls = gateway(
        setup,
        lambda r: httpx.Response(200, json=response("A short explanation.")),
        suite=suite,
    )
    result = g.generate_text(
        "tutor",
        {"source": "SQL"},
        ctx,
        validate_business=lambda output, _: len(output) < 100,
    )
    assert result["text"] == "A short explanation."
    assert "response_format" not in json.loads(calls[0].content)
    setup[0]["profiles"]["nebius"]["structured_mode"] = "json_object_validated"
    profile = setup[0]["profiles"]["nebius"]
    r = json.load(open(profile["capability_report_path"]))
    r["structured_mode"] = "json_object_validated"
    open(profile["capability_report_path"], "w").write(json.dumps(r))
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response()), suite=suite
    )
    generate(g, ctx)
    assert json.loads(calls[0].content)["response_format"] == {"type": "json_object"}


def test_invalid_context_and_missing_credentials_are_rejected(setup):
    g, ctx, events, calls = gateway(
        setup, lambda r: httpx.Response(200, json=response())
    )
    wrong = ExecutionContext(**{**ctx.__dict__, "routing_revision": "wrong"})
    with pytest.raises(ModelError, match="context_version_mismatch"):
        generate(g, wrong)
    setup[1].pop("NEBIUS_API_KEY")
    with pytest.raises(ModelError, match="provider_not_configured"):
        generate(g, ctx)
    assert not calls
