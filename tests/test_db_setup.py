"""
CareerBridge: verify the Supabase database is reachable and set up correctly.

Checks:
  1. .env settings are present
  2. Connection to Supabase works
  3. All 18 tables exist and can be queried (row count shown)
  4. The private storage bucket exists and is not public
  5. Write test: insert, read back and delete a test user (cleans up after itself)

Usage:
  pip install supabase python-dotenv
  python test_db_setup.py            # all checks
  python test_db_setup.py --no-write # skip the write test

Needs a .env file in the same folder:
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_KEY=your-secret-key        # secret / service_role key, server side only
  STORAGE_BUCKET=careerbridge-private # optional, this is the default
"""

import os
import sys
import uuid

from dotenv import load_dotenv

EXPECTED_TABLES = {
    "A. Identity and goals": ["users", "career_goals", "workflow_runs", "audit_events"],
    "B. Candidate profile": ["candidate_profiles", "skills", "candidate_skill_evidence"],
    "C. Market evidence": ["job_postings", "job_skill_requirements", "gap_analyses"],
    "D. Learning": ["learning_paths", "learning_resources", "learning_sessions"],
    "E. Mastery and evidence": ["rubric_versions", "assessment_attempts", "verified_skill_evidence"],
    "F. Résumé and wellbeing": ["resume_versions", "wellbeing_preferences"],
}

PASS = "PASS"
FAIL = "FAIL"
results = []  # (check name, ok, detail)


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    mark = PASS if ok else FAIL
    print(f"  [{mark}] {name}" + (f"  ({detail})" if detail else ""))


def short_error(exc):
    msg = getattr(exc, "message", None) or str(exc)
    return msg.splitlines()[0][:120]


def check_env():
    print("\n1. Settings")
    load_dotenv()
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    bucket = os.getenv("STORAGE_BUCKET", "careerbridge-private").strip()

    record("SUPABASE_URL set", bool(url), url if url else "missing in .env")
    record("SUPABASE_KEY set", bool(key), "hidden" if key else "missing in .env")
    if key and (key.startswith("sb_publishable_") or '"role":"anon"' in key):
        record("Key type", False, "looks like the public/anon key; use the secret key")
    return url, key, bucket


def connect(url, key):
    print("\n2. Connection")
    try:
        from supabase import create_client
    except ImportError:
        record("supabase package installed", False, "run: pip install supabase python-dotenv")
        return None
    try:
        client = create_client(url, key)
        # A real round trip: query a table we expect to exist.
        client.table("users").select("id").limit(1).execute()
        record("Connected to Supabase", True)
        return client
    except Exception as exc:  # noqa: BLE001
        record("Connected to Supabase", False, short_error(exc))
        return None


def check_tables(client):
    print("\n3. Tables (expected 18)")
    found = 0
    for domain, tables in EXPECTED_TABLES.items():
        print(f"  {domain}")
        for table in tables:
            try:
                resp = client.table(table).select("*", count="exact").limit(1).execute()
                rows = resp.count if resp.count is not None else len(resp.data)
                record(f"  {table}", True, f"{rows} rows")
                found += 1
            except Exception as exc:  # noqa: BLE001
                record(f"  {table}", False, short_error(exc))
    total = sum(len(t) for t in EXPECTED_TABLES.values())
    record("All tables present", found == total, f"{found} of {total}")


def check_bucket(client, bucket_name):
    print("\n4. Storage")
    try:
        bucket = client.storage.get_bucket(bucket_name)
        is_public = getattr(bucket, "public", None)
        if is_public is None and isinstance(bucket, dict):
            is_public = bucket.get("public")
        record(f"Bucket '{bucket_name}' exists", True)
        record("Bucket is private", is_public is False,
               "public!" if is_public else "not public")
    except Exception as exc:  # noqa: BLE001
        record(f"Bucket '{bucket_name}' exists", False, short_error(exc))


def check_write(client):
    print("\n5. Write test (creates and removes one test user)")
    email = f"db-test-{uuid.uuid4().hex[:8]}@example.invalid"
    user_id = None
    try:
        resp = client.table("users").insert({"email": email, "name": "DB setup test"}).execute()
        user_id = resp.data[0]["id"]
        record("Insert", True)

        resp = client.table("users").select("id,email,created_at,updated_at").eq("id", user_id).execute()
        ok = len(resp.data) == 1 and resp.data[0]["email"] == email
        record("Read back", ok)
        record("Timestamps set", bool(resp.data and resp.data[0]["created_at"] and resp.data[0]["updated_at"]))
    except Exception as exc:  # noqa: BLE001
        record("Insert / read", False, short_error(exc))
    finally:
        if user_id:
            try:
                client.table("users").delete().eq("id", user_id).execute()
                left = client.table("users").select("id").eq("id", user_id).execute()
                record("Delete (cleanup)", len(left.data) == 0)
            except Exception as exc:  # noqa: BLE001
                record("Delete (cleanup)", False, f"{short_error(exc)}; remove {email} by hand")


def main():
    print("CareerBridge database setup check")
    url, key, bucket = check_env()
    if not (url and key):
        return finish()

    client = connect(url, key)
    if client is None:
        return finish()

    check_tables(client)
    check_bucket(client, bucket)
    if "--no-write" not in sys.argv:
        check_write(client)
    return finish()


def finish():
    failed = [r for r in results if not r[1]]
    print("\n" + "-" * 50)
    if failed:
        print(f"{len(failed)} check(s) failed:")
        for name, _, detail in failed:
            print(f"  - {name.strip()}: {detail}")
        print("\nCommon fixes: run database/schema.sql in the Supabase SQL Editor; "
              "check SUPABASE_URL and use the secret key.")
        return 1
    print(f"All {len(results)} checks passed. Database is ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
