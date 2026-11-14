"""Supabase connection and shared helpers for the CareerBridge data layer.

Every domain module imports from here. Nothing outside database/ should talk to
Supabase directly.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv


class DBError(Exception):
    """Any data-layer failure. The message is safe to show in the UI."""


# ---------------------------------------------------------------------------
# Settings and connection
# ---------------------------------------------------------------------------

def _load_env() -> None:
    """Load .env from the current folder or any parent, then from the repo root."""
    load_dotenv()  # searches upward from the calling script
    repo_env = Path(__file__).resolve().parent.parent / ".env"
    if repo_env.exists():
        load_dotenv(repo_env)


def bucket_name() -> str:
    _load_env()
    return os.getenv("STORAGE_BUCKET", "careerbridge-private")


@lru_cache(maxsize=1)
def get_client():
    """Return one shared Supabase client (created on first use)."""
    _load_env()
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_KEY", "").strip()
    if url.endswith("/rest/v1"):
        url = url[: -len("/rest/v1")]
    if not url or not key:
        raise DBError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    try:
        from supabase import create_client
    except ImportError as exc:
        raise DBError("Install the client: pip install -r requirements.txt") from exc
    return create_client(url, key)


def table(name: str):
    return get_client().table(name)


def storage():
    return get_client().storage.from_(bucket_name())


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def _clean_message(exc: Exception) -> str:
    msg = getattr(exc, "message", None) or str(exc)
    return msg.splitlines()[0][:300]


def run(query, action: str) -> list[dict]:
    """Execute a query builder and return its rows, raising DBError on failure."""
    try:
        resp = query.execute()
    except Exception as exc:  # noqa: BLE001 - convert every client error
        raise DBError(f"{action} failed: {_clean_message(exc)}") from exc
    data = resp.data
    if data is None:
        return []
    return data if isinstance(data, list) else [data]


def first(rows: list[dict]) -> dict | None:
    return rows[0] if rows else None


def require(row: dict | None, what: str) -> dict:
    if row is None:
        raise DBError(f"{what} not found")
    return row


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def check_limit(items: Iterable[Any], limit: int, what: str) -> list:
    items = list(items)
    if len(items) > limit:
        raise DBError(f"Too many {what}: {len(items)} given, maximum is {limit}")
    return items


def pick(fields: dict, allowed: set[str]) -> dict:
    """Keep only allowed, non-None fields for an update."""
    unknown = set(fields) - allowed
    if unknown:
        raise DBError(f"Cannot update field(s): {', '.join(sorted(unknown))}")
    return {k: v for k, v in fields.items() if v is not None}


def get_by_id(table_name: str, row_id: str, what: str | None = None,
              select: str = "*") -> dict | None:
    rows = run(table(table_name).select(select).eq("id", row_id).limit(1),
               f"Get {what or table_name}")
    return first(rows)


def delete_by_id(table_name: str, row_id: str, what: str | None = None) -> bool:
    rows = run(table(table_name).delete().eq("id", row_id), f"Delete {what or table_name}")
    return bool(rows)


def remove_files(paths: Iterable[str | None]) -> None:
    """Delete stored files; missing files are ignored."""
    paths = [p for p in paths if p]
    if not paths:
        return
    try:
        storage().remove(paths)
    except Exception as exc:  # noqa: BLE001
        raise DBError(f"Delete stored file failed: {_clean_message(exc)}") from exc


def upload_file(path: str, data: bytes, content_type: str) -> str:
    try:
        storage().upload(path, data, {"content-type": content_type, "upsert": "true"})
    except Exception as exc:  # noqa: BLE001
        raise DBError(f"Upload failed: {_clean_message(exc)}") from exc
    return path


def signed_url(path: str, expires_in: int = 3600) -> str:
    try:
        res = storage().create_signed_url(path, expires_in)
    except Exception as exc:  # noqa: BLE001
        raise DBError(f"Signed URL failed: {_clean_message(exc)}") from exc
    url = (res or {}).get("signedURL") or (res or {}).get("signedUrl")
    if not url:
        raise DBError("Signed URL failed: no URL returned")
    return url


CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}
