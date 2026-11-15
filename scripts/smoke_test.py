"""End-to-end smoke test against a running CareerBridge API, in mock mode,
using real Supabase Auth (AUTH_MODE=supabase, the backend default).

Exercises the whole product flow over HTTP: create a confirmed Supabase Auth
user -> sign in for a real access token -> upload résumé -> poll/confirm ->
goal -> job search -> gap analysis -> progress. Prints PASS/FAIL
per step and always deletes the test app user AND the test auth user at the
end (even on failure), since it uses a clearly fake @example.com address.

Usage:
    uvicorn careerbridge.main:app --port 8000   (separate terminal, mock mode)
    python scripts/smoke_test.py
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from supabase import create_client

from database import users
from database.client import get_client

BASE_URL = "http://localhost:8000"
FIXTURE = Path(__file__).parent / "fixtures" / "sample_resume.docx"
EXPECTED_SKILLS = {"Java", "Spring Boot", "REST APIs", "Docker", "PostgreSQL", "React", "Leadership"}
TEST_PASSWORD = "Smoke-test-password-1!"

_user_id: str | None = None  # the app `users` row id (== the auth user id)
_auth_user_id: str | None = None
_failed = False


def run_step(name: str, fn):
    global _failed
    try:
        value = fn()
        print(f"[PASS] {name}")
        return value
    except Exception as exc:  # noqa: BLE001 - we want to report and stop, not crash ugly
        _failed = True
        print(f"[FAIL] {name}: {exc}")
        cleanup()
        sys.exit(1)


def cleanup():
    if _user_id:
        try:
            users.delete_user(_user_id)
            print(f"(cleanup) deleted app user {_user_id}")
        except Exception as exc:  # noqa: BLE001
            print(f"(cleanup) failed to delete app user {_user_id}: {exc}")
    if _auth_user_id:
        try:
            get_client().auth.admin.delete_user(_auth_user_id)
            print(f"(cleanup) deleted auth user {_auth_user_id}")
        except Exception as exc:  # noqa: BLE001
            print(f"(cleanup) failed to delete auth user {_auth_user_id}: {exc}")


def main():
    global _user_id, _auth_user_id
    client = httpx.Client(base_url=BASE_URL, timeout=30)

    run_step("health check", lambda: _expect_ok(client.get("/api/health")))

    email = f"smoke-test-{uuid.uuid4().hex[:10]}@example.com"

    # The shared admin/secret client (database.client.get_client()) — used
    # for admin.create_user/delete_user only. It must never sign in on this
    # instance (see the sign-in client below).
    admin = get_client()

    def _create_auth_user():
        created = admin.auth.admin.create_user({
            "email": email,
            "password": TEST_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"full_name": "Smoke Test", "username": "smoketest", "consent": True},
        })
        return created.user.id

    _auth_user_id = run_step("create confirmed Supabase Auth user", _create_auth_user)
    _user_id = _auth_user_id  # the app `users` row is created lazily, with this same id, on first request below

    # sign_in_with_password mutates ITS OWN client's session, swapping that
    # client's Authorization header from the service key to the signed-in
    # user's token for every later call. Doing that on the shared admin
    # client above would silently break admin.create_user/delete_user and
    # every table() query for the rest of this process — a throwaway client
    # instance avoids it, mirroring how the real frontend's own supabase-js
    # client is never the backend's admin client either. See
    # docs/INTEGRATION_NOTES.md.
    def _sign_in():
        url = os.environ["SUPABASE_URL"].strip().rstrip("/")
        key = os.environ["SUPABASE_PUBLISHABLE_KEY"].strip()
        sign_in_client = create_client(url, key)
        session = sign_in_client.auth.sign_in_with_password({"email": email, "password": TEST_PASSWORD})
        return session.session.access_token

    access_token = run_step("sign in as test user", _sign_in)
    headers = {"Authorization": f"Bearer {access_token}"}

    profile = run_step("upload résumé", lambda: _upload_resume(client, headers))
    profile_id = profile["id"]

    run_step("résumé parsed expected skills", lambda: _check_expected_skills(profile))

    profile = run_step("confirm profile", lambda: _expect_ok(client.put(
        f"/api/profiles/{profile_id}/confirm", headers={**headers, "Idempotency-Key": f"confirm-{uuid.uuid4()}"},
        json={"skills": [{"skill": s["skill"], "status": "present"} for s in profile["skills"]]})))

    goal = run_step("create goal", lambda: _expect_ok(client.post(
        "/api/goals", headers=headers,
        json={"target_role": "Software Engineer, AI Applications", "location": "Bay Area", "seniority": "mid"})))
    goal_id = goal["id"]

    job_result = run_step("search jobs", lambda: _expect_ok(client.post(
        "/api/jobs/search", headers=headers, json={"goal_id": goal_id})))
    job_ids = [j["id"] for j in job_result["jobs"]]
    if not job_ids:
        run_step("at least one job posting found", lambda: (_ for _ in ()).throw(RuntimeError("no jobs returned")))

    gap_analysis = run_step("gap analysis", lambda: _expect_ok(client.post(
        "/api/skills/analyze", headers=headers,
        json={"goal_id": goal_id, "profile_id": profile_id, "job_ids": job_ids})))

    gaps = gap_analysis.get("gaps") or []
    gap_skill = gaps[0]["skill"] if gaps else None
    if not gap_skill:
        run_step("at least one skill gap found", lambda: (_ for _ in ()).throw(RuntimeError("no gaps returned")))

    run_step("progress includes the saved gap", lambda: _check_progress(client, headers, gap_skill))

    run_step("delete test app user", lambda: _expect_status(
        client.delete(f"/api/users/{_user_id}", headers=headers), 204))
    _user_id = None

    run_step("delete test auth user", lambda: admin.auth.admin.delete_user(_auth_user_id))
    _auth_user_id = None

    print("\nAll smoke test steps passed.")


def _expect_ok(response: httpx.Response) -> dict:
    if response.status_code not in (200, 201):
        raise RuntimeError(f"{response.request.method} {response.request.url} -> "
                           f"{response.status_code}: {response.text[:300]}")
    return response.json()


def _expect_status(response: httpx.Response, status: int) -> None:
    if response.status_code != status:
        raise RuntimeError(f"{response.request.method} {response.request.url} -> "
                           f"expected {status}, got {response.status_code}: {response.text[:300]}")



def _upload_resume(client: httpx.Client, headers: dict) -> dict:
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/onboarding/parse", headers=headers,
            files={"file": ("sample_resume.docx", f,
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    return _expect_ok(response)


def _check_expected_skills(profile: dict) -> None:
    found = {s["skill"] for s in profile["skills"]}
    missing = EXPECTED_SKILLS - found
    if missing:
        raise RuntimeError(f"expected skills not found in parsed profile: {sorted(missing)}")



def _check_progress(client: httpx.Client, headers: dict, skill: str) -> None:
    progress = _expect_ok(client.get("/api/progress", headers=headers))
    gap = next((g for g in progress["gaps"] if g["skill"] == skill), None)
    if not gap or gap["status"] != "not_started":
        raise RuntimeError(f"expected {skill!r} to show status=not_started in progress, got {gap}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        cleanup()
        raise
