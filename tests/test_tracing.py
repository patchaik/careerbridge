import json

import pytest

from careerbridge import tracing


def test_tracing_is_optional_and_fail_open(monkeypatch):
    monkeypatch.setattr(tracing, "client", lambda: None)
    with tracing.trace("test") as span:
        span.update(output={"status": "ok"})
    def broken():
        raise RuntimeError("secret credential")
    monkeypatch.setattr(tracing, "client", broken)
    with tracing.trace("test"):
        tracing.generation("test-model").end()
    tracing.flush()


def test_real_sdk_nesting_usage_and_no_exception_content(monkeypatch):
    from langfuse import Langfuse
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    exporter = InMemorySpanExporter()
    sdk = Langfuse(public_key="pk-lf-offline-test", secret_key="sk-lf-offline-test",
                   base_url="http://localhost:1", tracer_provider=TracerProvider(), span_exporter=exporter)
    monkeypatch.setattr(tracing, "client", lambda: sdk)
    with pytest.raises(ValueError):
        with tracing.trace("discover-resources", user_id="private-user", workflow_id="wf"):
            with tracing.trace("run-resource_extract"):
                generation = tracing.generation("generate-resource_extract", model="test-model")
                generation.update(usage_details={"input": 12, "output": 8}, output={"status": "validated"})
                generation.end()
            raise ValueError("PRIVATE RESUME AND SECRET")
    tracing.flush()
    spans = {s.name: s for s in exporter.get_finished_spans()}
    assert len(spans) == 3
    assert spans["run-resource_extract"].parent.span_id == spans["discover-resources"].context.span_id
    assert spans["generate-resource_extract"].parent.span_id == spans["run-resource_extract"].context.span_id
    exported = json.dumps([dict(s.attributes) for s in spans.values()])
    assert "test-model" in exported and '12' in exported and '8' in exported
    assert "PRIVATE RESUME" not in exported and "private-user" not in exported
    assert all(not s.events for s in spans.values())
    sdk.shutdown()
