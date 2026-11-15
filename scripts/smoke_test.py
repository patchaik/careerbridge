"""End-to-end smoke test against a running CareerBridge API, in mock mode.

Exercises the whole product flow over HTTP: create user -> upload résumé ->
poll/confirm -> goal -> job search -> gap analysis -> resources -> generate
path -> approve rubric -> tutor -> start + submit assessment -> progress.
Prints PASS/FAIL per step and always deletes the test user at the end
(even on failure), since it uses a clearly fake @example.com address.

Usage:
    uvicorn careerbridge.main:app --port 8000   (separate terminal, mock mode)
    python scripts/smoke_test.py
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import httpx

BASE_URL = "http://localhost:8000"
FIXTURE = Path(__file__).parent / "fixtures" / "sample_resume.docx"
EXPECTED_SKILLS = {"Java", "Spring Boot", "REST APIs", "Docker", "PostgreSQL", "React", "Leadership"}

_user_id: str | None = None
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
    if not _user_id:
        return
    try:
        httpx.delete(f"{BASE_URL}/api/users/{_user_id}", timeout=10)
        print(f"(cleanup) deleted test user {_user_id}")
    except Exception as exc:  # noqa: BLE001
        print(f"(cleanup) failed to delete test user {_user_id}: {exc}")


def main():
    global _user_id
    client = httpx.Client(base_url=BASE_URL, timeout=30)

    run_step("health check", lambda: _expect_ok(client.get("/api/health")))

    email = f"smoke-test-{uuid.uuid4().hex[:10]}@example.com"
    user = run_step("create user", lambda: _expect_ok(
        client.post("/api/users", json={"email": email, "name": "Smoke Test", "consent": True})))
    _user_id = user["id"]
    headers = {"X-User-Id": _user_id}

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

    path = run_step("generate learning path", lambda: _expect_ok(client.post(
        "/api/paths/generate", headers=headers, json={"goal_id": goal_id, "skill": gap_skill})))
    path_id = path["id"]

    run_step("resources available for the gap skill", lambda: _check_resources(client, gap_skill))

    path = run_step("approve path (freezes rubric)", lambda: _expect_ok(
        client.put(f"/api/paths/{path_id}/approve")))
    if path["rubric"]["approval_status"] != "frozen":
        run_step("rubric is frozen after approval",
                 lambda: (_ for _ in ()).throw(RuntimeError("rubric not frozen")))

    milestone_id = path["milestones"][0]["id"]
    run_step("tutor question", lambda: _expect_ok(client.post(
        "/api/arena/tutor",
        json={"path_id": path_id, "milestone_id": milestone_id, "message": "Give me a hint"})))

    attempt = run_step("start assessment", lambda: _expect_ok(client.post(
        "/api/assessments/start", headers={**headers, "Idempotency-Key": f"start-{uuid.uuid4()}"},
        json={"path_id": path_id})))
    attempt_id = attempt["attempt_id"]

    result = run_step("submit assessment (pass)", lambda: _submit_passing(client, headers, attempt_id, attempt))
    run_step("verified evidence recorded", lambda: _require(
        result.get("verified_evidence_id"), "no verified_evidence_id on a passed attempt"))

    run_step("progress reflects demonstrated skill", lambda: _check_progress(client, headers, gap_skill))

    run_step("delete test user", lambda: _expect_status(
        client.delete(f"/api/users/{_user_id}"), 204))

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


def _require(value, message: str):
    if not value:
        raise RuntimeError(message)
    return value


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


def _check_resources(client: httpx.Client, skill: str) -> None:
    resources = _expect_ok(client.get("/api/resources", params={"skill": skill}))
    if not resources["free"]:
        raise RuntimeError(f"no free resources found for {skill!r}")


def _submit_passing(client: httpx.Client, headers: dict, attempt_id: str, attempt: dict) -> dict:
    answers = [{"question_id": q["id"], "answer": q["choices"][0]} for q in attempt["quiz"]]
    response = client.post(
        "/api/assessments/submit", headers={**headers, "Idempotency-Key": f"submit-{uuid.uuid4()}"},
        json={"attempt_id": attempt_id, "quiz_answers": answers,
              "project_submission": "Here is my mock demonstration of the concept."})
    result = _expect_ok(response)
    if result["status"] != "passed":
        raise RuntimeError(f"expected a passing attempt, got status={result['status']!r}: {result}")
    return result


def _check_progress(client: httpx.Client, headers: dict, skill: str) -> None:
    progress = _expect_ok(client.get("/api/progress", headers=headers))
    gap = next((g for g in progress["gaps"] if g["skill"] == skill), None)
    if not gap or gap["status"] != "demonstrated":
        raise RuntimeError(f"expected {skill!r} to show status=demonstrated in progress, got {gap}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        cleanup()
        raise
