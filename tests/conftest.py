"""Isolated PostgreSQL databases only; TEST_DATABASE_URL must point to a test server."""

import os
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row

from database.migrate import migrate


@pytest.fixture
def database_url():
    base = os.environ.get("TEST_DATABASE_URL")
    if not base:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
    name = "cb_test_" + uuid4().hex
    with psycopg.connect(base, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    params = psycopg.conninfo.conninfo_to_dict(base)
    params["dbname"] = name
    url = psycopg.conninfo.make_conninfo(**params)
    with psycopg.connect(url) as conn:
        # Supabase-only objects needed by the reviewed baseline; no production data.
        conn.execute(
            "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$"
        )
        conn.execute(
            "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cb_untrusted') THEN CREATE ROLE cb_untrusted NOLOGIN; END IF; END $$"
        )
        conn.execute(
            "CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean)"
        )
    yield url
    with psycopg.connect(base, autocommit=True) as admin:
        admin.execute(
            sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
        )


@pytest.fixture
def db(database_url):
    with psycopg.connect(database_url) as conn:
        migrate(conn)
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        yield conn
