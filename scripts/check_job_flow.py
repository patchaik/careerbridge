"""Synthetic resume -> confirmation -> live market evidence -> stored gap report."""

import argparse
import io
import json
import os
from pathlib import Path
from uuid import uuid4
import httpx
from docx import Document

from database import users, jobs
from database.client import run, table, get_client
from supabase import create_client


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", default="job-flow-check.json")
    args = parser.parse_args()
    if os.getenv("CAREERBRIDGE_ENV") not in {"development", "test"}:
        parser.error("Use a development/test Supabase environment")

    user = None
    posting_ids = []
    report = {"roles": []}

    def checked(response):
        if response.is_error:
            if user:
                rows = run(
                    table("workflow_runs")
                    .select("state_json")
                    .eq("user_id", user["id"]),
                    "Debug synthetic workflow",
                )
                print(
                    "Workflow status:",
                    [
                        (
                            r["state_json"].get("kind"),
                            r["state_json"].get("status"),
                            r["state_json"].get("error"),
                        )
                        for r in rows
                    ],
                    flush=True,
                )
            raise AssertionError(
                (response.status_code, response.json().get("error", {}))
            )
        return response.json()

    try:
        with httpx.Client(base_url=args.base_url, timeout=240, trust_env=False) as c:
            email = f"job-check-{uuid4().hex}@example.com"
            password = uuid4().hex + "Aa!7"
            auth_user = (
                get_client()
                .auth.admin.create_user(
                    {
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "user_metadata": {
                            "full_name": "Synthetic Job Check",
                            "consent": True,
                        },
                    }
                )
                .user
            )
            user = {"id": auth_user.id}
            # Sign-in must not mutate the shared service-role client's session.
            sign_in = create_client(
                os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]
            )
            session = sign_in.auth.sign_in_with_password(
                {"email": email, "password": password}
            ).session
            c.headers["Authorization"] = "Bearer " + session.access_token
            doc = Document()
            doc.add_paragraph("I wrote Python scripts. I used SQL to query a database.")
            b = io.BytesIO()
            doc.save(b)
            profile = checked(
                c.post(
                    "/api/onboarding/parse",
                    files={
                        "file": (
                            "synthetic-jobs.docx",
                            b.getvalue(),
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        )
                    },
                )
            )
            assert not profile["confirmed_at"]
            goal = checked(
                c.post(
                    "/api/goals",
                    json={
                        "target_role": "Python backend engineer",
                        "location": "remote",
                    },
                )
            )
            assert (
                c.post("/api/jobs/search", json={"goal_id": goal["id"]}).status_code
                == 409
            )
            profile = checked(
                c.put(
                    "/api/profiles/" + profile["id"] + "/confirm",
                    headers={"Idempotency-Key": str(uuid4())},
                    json={
                        "skills": [
                            {
                                "skill": s["skill"],
                                "status": "user_confirmed",
                                "excerpt": s["excerpt"],
                            }
                            for s in profile["skills"]
                        ]
                    },
                )
            )
            assert profile["confirmed_at"]
            for role, loc in [
                ("Python backend engineer", "remote"),
                ("Registered Nurse", "California"),
            ]:
                if role != "Python backend engineer":
                    goal = checked(
                        c.post(
                            "/api/goals", json={"target_role": role, "location": loc}
                        )
                    )
                result = checked(
                    c.post("/api/jobs/search", json={"goal_id": goal["id"], "limit": 5})
                )
                posting_ids.extend(j["id"] for j in result["jobs"])
                assert result["source"] == "keenable" and not result["fallback_used"]
                assert result["jobs"], "No verifiable postings returned for " + role
                analysis = checked(
                    c.post(
                        "/api/skills/analyze",
                        json={
                            "goal_id": goal["id"],
                            "profile_id": profile["id"],
                            "job_ids": [j["id"] for j in result["jobs"]],
                        },
                    )
                )
                assert checked(c.get("/api/gap-analyses/" + analysis["id"])) == analysis
                assert set(analysis["job_ids"]) == {j["id"] for j in result["jobs"]}
                for j in result["jobs"]:
                    assert checked(c.get("/api/jobs/" + j["id"])) == j
                    stored = jobs.get_job(j["id"])
                    reqs = jobs.list_requirements(j["id"])
                    assert stored["provider"] == "cached" and stored[
                        "provider_job_id"
                    ].startswith("keenable:")
                    assert len(reqs) == len(j["requirements"]) and all(
                        r["excerpt"] for r in reqs
                    )
                for gap in analysis["gaps"]:
                    assert gap["sources"] and all(
                        s["excerpt"] and s["job_id"] in posting_ids
                        for s in gap["sources"]
                    )
                wf = users.get_workflow(result["workflow_id"])
                assert (
                    wf["state_json"]["status"] == "complete"
                    and wf["state_json"]["prompt_version"] == "job-requirements-v1"
                )
                events = run(
                    table("audit_events")
                    .select("detail_json")
                    .eq("user_id", user["id"])
                    .eq("entity_id", result["workflow_id"]),
                    "Read synthetic audit",
                )
                assert any(
                    e["detail_json"].get("task") == "job_extract"
                    and e["detail_json"].get("status") == "succeeded"
                    for e in events
                )
                forbidden = c.get(
                    "/api/gap-analyses/" + analysis["id"],
                    headers={"Authorization": "Bearer invalid-test-token"},
                )
                assert forbidden.status_code in (401, 403, 404)
                item = {
                    "role": role,
                    "postings": len(result["jobs"]),
                    "gaps": len(analysis["gaps"]),
                    "matches": analysis["existing_skills"],
                    "titles": [j["title"] for j in result["jobs"]],
                    "evidence_saved": True,
                    "reload_matches": True,
                    "audit_linked": True,
                    "owner_checked": True,
                }
                report["roles"].append(item)
                print(json.dumps(item), flush=True)
            assert set(report["roles"][0]["titles"]).isdisjoint(
                report["roles"][1]["titles"]
            )
            report["role_change_changes_results"] = True
    finally:
        if user:
            users.delete_user(user["id"])
            for jid in posting_ids:
                jobs.delete_job(jid)
            get_client().auth.admin.delete_user(user["id"])
            report["synthetic_data_cleaned"] = users.get_user(user["id"]) is None
        Path(args.output).write_text(json.dumps(report, indent=2))
        print(
            "Synthetic data cleaned:", report.get("synthetic_data_cleaned"), flush=True
        )


if __name__ == "__main__":
    main()
