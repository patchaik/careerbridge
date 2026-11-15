"""Explicit, transactional migrations; never called by application startup."""

import hashlib
import os
from pathlib import Path

import psycopg

ROOT = Path(__file__).parent


def migrate(conn):
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(184177022)")
        exists = conn.execute("SELECT to_regclass('public.users')").fetchone()[0]
        if exists:
            columns = {
                r[0]
                for r in conn.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'"
                )
            }
            if not {"email", "preferences_json", "auth_provider"} <= columns:
                raise RuntimeError(
                    "Unsupported legacy schema: reconcile agentic-fw before migrating"
                )
        else:
            conn.execute((ROOT / "schema.sql").read_text())
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        conn.execute("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY")
        for path in sorted((ROOT / "migrations").glob("*.sql")):
            content = path.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            applied = conn.execute(
                "SELECT sha256 FROM schema_migrations WHERE version=%s", (path.name,)
            ).fetchone()
            if applied:
                if applied[0] != digest:
                    raise RuntimeError(f"Applied migration changed: {path.name}")
                continue
            conn.execute(content.decode())
            conn.execute(
                "INSERT INTO schema_migrations(version,sha256) VALUES (%s,%s)",
                (path.name, digest),
            )


if __name__ == "__main__":
    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        migrate(connection)
    print("Migrations applied")
