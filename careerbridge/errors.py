"""HTTP-facing error type + the Error-shape mapping used across main.py."""

from __future__ import annotations

from typing import Optional


class ApiError(Exception):
    """Raise anywhere in careerbridge/store.py or main.py to control the exact
    HTTP status + Error-shape code/message returned to the client."""

    def __init__(self, status_code: int, code: str, message: str, field: Optional[str] = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        super().__init__(message)

    def body(self) -> dict:
        error = {"code": self.code, "message": self.message}
        if self.field:
            error["field"] = self.field
        return {"error": error}


def db_error_to_api_error(message: str) -> ApiError:
    """Heuristic mapping for database.client.DBError, per api/README.md's table:
    'not found' -> 404, a refused product rule -> 409, bad input -> 422."""
    lower = message.lower()
    if message.startswith("Invalid ") or "must be one of" in lower or "is required" in lower:
        return ApiError(422, "validation_error", message)
    if "not found" in lower:
        return ApiError(404, "not_found", message)
    return ApiError(409, "rule_violation", message)
