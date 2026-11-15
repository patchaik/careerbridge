"""Optional, content-free Langfuse tracing for the existing HTTP model gateway."""

import hashlib
import logging
import os
from contextlib import ExitStack, contextmanager
from functools import lru_cache

log = logging.getLogger(__name__)


def safely(action):
    try:
        return action()
    except Exception as exc:
        # Telemetry must not interrupt application work or echo provider payloads.
        log.warning("Tracing unavailable: %s", type(exc).__name__)
        return None


@lru_cache(maxsize=1)
def client():
    if os.getenv("LANGFUSE_TRACING_ENABLED", "true").lower() == "false":
        return None
    if not all(os.getenv(k) for k in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL")):
        return None
    # Initialize only after the application has loaded its environment.
    from langfuse import Langfuse
    from langfuse.span_filter import is_langfuse_span

    return Langfuse(environment=os.getenv("CAREERBRIDGE_ENV", "development"),
                    timeout=5, should_export_span=is_langfuse_span)


class Observation:
    def __init__(self, span=None):
        self.span = span

    def update(self, **fields):
        if self.span is not None:
            safely(lambda: self.span.update(**fields))

    def end(self):
        if self.span is not None:
            safely(self.span.end)


@contextmanager
def trace(name, *, user_id=None, workflow_id=None, **fields):
    stack, observation = ExitStack(), Observation()
    sdk = safely(client)
    if sdk is not None:
        def start():
            from langfuse import propagate_attributes
            stack.enter_context(propagate_attributes(
                user_id=hashlib.sha256(user_id.encode()).hexdigest() if user_id else None,
                metadata={"workflow_id": workflow_id} if workflow_id else None,
                tags=["careerbridge"],
            ))
            return stack.enter_context(sdk.start_as_current_observation(name=name, **fields))
        observation = Observation(safely(start))
    try:
        yield observation
    except Exception as exc:
        observation.update(level="ERROR", status_message=getattr(exc, "code", type(exc).__name__))
        raise
    finally:
        # Do not let the SDK automatically record exceptions containing source data.
        safely(stack.close)


def generation(name, **fields):
    sdk = safely(client)
    return Observation(safely(lambda: sdk.start_observation(
        name=name, as_type="generation", **fields)) if sdk is not None else None)


def trace_id():
    sdk = safely(client)
    return safely(sdk.get_current_trace_id) if sdk is not None else None


def flush():
    sdk = safely(client)
    if sdk is not None:
        safely(sdk.flush)
