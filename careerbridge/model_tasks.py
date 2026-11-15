"""Run a versioned task with pinned routing and durable workflow audit."""

from datetime import timedelta
from careerbridge.model_gateway import (
    ModelGateway,
    ExecutionContext,
    ModelError,
    utcnow,
)
from database import users
from database.client import DBError


def generate_task(state, suite, task_name, schema_id, data, validate_business):
    task = suite["tasks"][task_name]
    routing = state["model_routing"]
    context = ExecutionContext(
        state["workflow_id"],
        state["user_id"],
        routing["revision"],
        task["prompt_version"],
        task["output_schema_version"],
        utcnow() + timedelta(seconds=routing["config"]["timeout_seconds"]),
    )

    def record(event):
        try:
            saved = users.log_event(
                state["user_id"],
                "model_invocation",
                "workflow",
                state["workflow_id"],
                event,
            )
        except DBError as exc:
            raise ModelError("invocation_not_recorded") from exc
        if not saved:
            raise ModelError("invocation_not_recorded")

    gateway = ModelGateway(routing, suite, record)
    try:
        return gateway.generate_json(
            task_name, schema_id, data, context, validate_business=validate_business
        )["validated_data"]
    finally:
        gateway.close()
