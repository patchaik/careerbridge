"""Live job -> gap -> resource discovery, reload and stage timing checks.

Uses a disposable learner and a seeded skill gap for the resource check.
Job search and resource discovery use live providers; public catalog entries remain.
Run with server credentials loaded and an API using the same development project.
"""

import argparse
import json
import os
from pathlib import Path
from time import perf_counter
from uuid import uuid4

import httpx
from supabase import create_client
from database import users, jobs
from database.client import get_client, run, table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8003")
    parser.add_argument("--output", required=True)
    parser.add_argument("--skill", default="SQL")
    parser.add_argument("--resources-only", action="store_true")
    args = parser.parse_args()
    if os.getenv("CAREERBRIDGE_ENV") not in {"development", "test"}:
        parser.error("Use development/test Supabase")
    uid, posting_ids, report = None, [], {}

    def checked(response):
        if response.is_error:
            raise AssertionError((response.status_code, response.json().get("error")))
        return response.json()

    def measured(client, path, payload, name):
        start = perf_counter()
        result = checked(client.post(path, json=payload))
        elapsed = (perf_counter() - start) * 1000
        workflow = users.get_workflow(result["workflow_id"])
        assert (
            workflow["user_id"] == uid
            and workflow["state_json"]["status"] == "complete"
        )
        timings = workflow["state_json"]["timings_ms"]
        assert set(timings) == {"search", "fetch", "model", "save", "total"}
        assert all(value > 0 for value in timings.values())
        assert (
            timings["total"]
            >= sum(timings[k] for k in ("search", "fetch", "model", "save")) - 1
        )
        report[name] = {"stages_ms": timings, "http_ms": round(elapsed, 3),
                        "trace_id": workflow["state_json"].get("trace_id"),
                        "diagnostics": workflow["state_json"].get("diagnostics")}
        print(name, json.dumps(report[name]), flush=True)
        return result

    try:
        email, password = (
            f"discovery-check-{uuid4().hex}@example.com",
            uuid4().hex + "Aa!7",
        )
        auth = (
            get_client()
            .auth.admin.create_user(
                {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": "Synthetic Discovery Check",
                        "consent": True,
                    },
                }
            )
            .user
        )
        uid = auth.id
        session = (
            create_client(
                os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]
            )
            .auth.sign_in_with_password({"email": email, "password": password})
            .session
        )
        with httpx.Client(
            base_url=args.base_url,
            timeout=300,
            trust_env=False,
            headers={"Authorization": "Bearer " + session.access_token},
        ) as client:
            profile = checked(
                client.post("/api/onboarding/parse", json={"skills": ["Spreadsheets"]})
            )
            checked(
                client.put(
                    f"/api/profiles/{profile['id']}/confirm",
                    json={
                        "skills": [{"skill": "Spreadsheets", "status": "self_reported"}]
                    },
                )
            )
            goal = checked(
                client.post(
                    "/api/goals",
                    json={"target_role": "Business Analyst", "location": "remote"},
                )
            )
            found = {"jobs": []}
            if not args.resources_only:
                found = measured(
                    client, "/api/jobs/search", {"goal_id": goal["id"], "limit": 5}, "jobs"
                )
                assert (
                    found["jobs"]
                    and found["source"] == "keenable"
                    and not found["fallback_used"]
                )
                posting_ids = [job["id"] for job in found["jobs"]]
                for job in found["jobs"]:
                    assert checked(client.get("/api/jobs/" + job["id"])) == job
                    assert len(jobs.list_requirements(job["id"])) == len(
                        job["requirements"]
                    )
                    assert all(
                        r["skill"].casefold() in r["excerpt"].casefold()
                        for r in job["requirements"]
                    )
                analysis = checked(
                    client.post(
                        "/api/skills/analyze",
                        json={
                            "goal_id": goal["id"],
                            "profile_id": profile["id"],
                            "job_ids": posting_ids,
                        },
                    )
                )
                assert (
                    checked(client.get("/api/gap-analyses/" + analysis["id"])) == analysis
                )
                assert analysis["gaps"]
            # A stable gap fixture keeps resource tests independent of changing job listings.
            fixture = jobs.upsert_job_posting(
                {
                    "provider": "cached",
                    "provider_job_id": "discovery-check-" + uuid4().hex,
                    "title": f"Synthetic {args.skill} requirement",
                    "url": "https://example.com/discovery-check",
                    "description": f"Synthetic fixture. Required: {args.skill}.",
                }
            )
            posting_ids.append(fixture["id"])
            jobs.add_job_requirements(
                fixture["id"],
                [
                    {
                        "skill": args.skill,
                        "importance": "required",
                        "excerpt": f"Required: {args.skill}.",
                    }
                ],
            )
            resource_analysis = checked(
                client.post(
                    "/api/skills/analyze",
                    json={
                        "goal_id": goal["id"],
                        "profile_id": profile["id"],
                        "job_ids": [fixture["id"]],
                    },
                )
            )
            skill = args.skill
            resources = measured(
                client,
                "/api/resources/search",
                {"analysis_id": resource_analysis["id"], "skill": skill},
                "resources",
            )
            assert (
                checked(
                    client.get("/api/resource-searches/" + resources["workflow_id"])
                )
                == resources
            )
            items = [
                r
                for kind in ("free", "paid", "mixed", "unknown")
                for r in resources[kind]
            ]
            assert items and resources["source"] == "keenable"
            rows = run(
                table("learning_resources")
                .select("id,url")
                .in_("id", [r["id"] for r in items]),
                "Check saved resources",
            )
            assert {r["id"]: r["url"] for r in rows} == {
                r["id"]: r["url"] for r in items
            }
            assert all(r["learning_evidence"] for r in items)
            assert resources["free"] and resources["paid"], "Expected both free and paid resources in this live fixture"
            report.update(
                passed=True,
                skill=skill,
                jobs_saved=len(found["jobs"]),
                resource_gap_fixture=True,
                resource_counts={
                    k: len(resources[k]) for k in ("free", "paid", "mixed", "unknown")
                },
                evidence_saved=True,
                reload_matches=True,
            )
    finally:
        if uid:
            users.delete_user(uid)
            for jid in posting_ids:
                jobs.delete_job(jid)
            get_client().auth.admin.delete_user(uid)
            report["disposable_learner_cleaned"] = True
        Path(args.output).write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
