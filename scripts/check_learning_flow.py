"""Live resources/model/Supabase checks using a disposable learner and synthetic gap.
The gap is seeded; resource discovery, extraction, all plans and persistence are live.
"""

import argparse
import json
import os
from pathlib import Path
from uuid import uuid4
import httpx
from supabase import create_client
from database import users, jobs, learning
from database.client import get_client, run, table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8003")
    parser.add_argument("--output", required=True)
    parser.add_argument("--keep-for-browser", action="store_true")
    parser.add_argument("--materials", action="store_true", help="Generate and reload every milestone lesson")
    parser.add_argument("--progress", action="store_true", help="Check saved completion, reopen, concurrency and resume (includes materials)")
    args = parser.parse_args()
    args.materials = args.materials or args.progress
    if os.getenv("CAREERBRIDGE_ENV") not in {"development", "test"}:
        parser.error("Use a development/test Supabase project")
    identities, posting, report = [], None, {}

    def checked(response):
        if response.is_error:
            raise AssertionError(
                (response.status_code, response.json().get("error", {}))
            )
        return response.json()

    def identity():
        email = f"learning-check-{uuid4().hex}@example.com"
        password = uuid4().hex + "Aa!7"
        auth = (
            get_client()
            .auth.admin.create_user(
                {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": "Synthetic Learning Check",
                        "consent": True,
                    },
                }
            )
            .user
        )
        identities.append(auth.id)
        session = (
            create_client(
                os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]
            )
            .auth.sign_in_with_password({"email": email, "password": password})
            .session
        )
        return email, password, session.access_token

    try:
        email, password, token = identity()
        with httpx.Client(
            base_url=args.base_url,
            timeout=240,
            trust_env=False,
            headers={"Authorization": "Bearer " + token},
        ) as c:
            profile = checked(
                c.post("/api/onboarding/parse", json={"skills": ["Spreadsheets"]})
            )
            profile = checked(
                c.put(
                    f"/api/profiles/{profile['id']}/confirm",
                    headers={"Idempotency-Key": str(uuid4())},
                    json={
                        "skills": [{"skill": "Spreadsheets", "status": "self_reported"}]
                    },
                )
            )
            goal = checked(c.post("/api/goals", json={"target_role": "Data analyst"}))
            posting = jobs.upsert_job_posting(
                {
                    "provider": "cached",
                    "provider_job_id": "synthetic-learning-" + uuid4().hex,
                    "title": "Synthetic data analyst check",
                    "url": "https://example.com/synthetic-learning-check",
                    "description": "Synthetic fixture. Required: SQL.",
                }
            )
            jobs.add_job_requirements(
                posting["id"],
                [
                    {
                        "skill": "SQL",
                        "importance": "required",
                        "excerpt": "Required: SQL.",
                    }
                ],
            )
            analysis = checked(
                c.post(
                    "/api/skills/analyze",
                    json={
                        "goal_id": goal["id"],
                        "profile_id": profile["id"],
                        "job_ids": [posting["id"]],
                    },
                )
            )
            found = checked(
                c.post(
                    "/api/resources/search",
                    json={"analysis_id": analysis["id"], "skill": "SQL"},
                )
            )
            assert (
                checked(c.get("/api/resource-searches/" + found["workflow_id"]))
                == found
            )
            resources = [
                r for kind in ("free", "paid", "mixed", "unknown") for r in found[kind]
            ]
            assert resources, "No usable resources returned"
            for r in resources:
                row = run(
                    table("learning_resources").select("*").eq("id", r["id"]),
                    "Check saved resource",
                )[0]
                assert (
                    row["title"] == r["title"]
                    and row["price_type"] == r["price_type"]
                    and row["verified_at"]
                )
            report.update(
                resource_counts={
                    k: len(found[k]) for k in ("free", "paid", "mixed", "unknown")
                },
                resource_reload=True,
                resources_saved=True,
                modes=[],
            )
            print(
                json.dumps({"resource_counts": report["resource_counts"]}), flush=True
            )
            chosen = ([found["free"][0]] if found["free"] else []) + (
                [found["paid"][0]] if found["paid"] else []
            )
            if not chosen:
                chosen = resources[:2]
            user_goal = "Combine customer and order tables using SQL joins and explain unmatched rows."
            for mode in ("text", "hands_on", "both"):
                payload = {
                    "resource_search_id": found["workflow_id"],
                    "learning_goal": user_goal,
                    "modality": mode,
                    "resource_ids": [r["id"] for r in chosen],
                }
                plan = checked(c.post("/api/paths/generate", json=payload))
                assert plan["objective"] == user_goal and plan["learning_outcome"]
                assert {m["mode"] for m in plan["milestones"]} == (
                    {"text", "hands_on"} if mode == "both" else {mode}
                )
                assert (
                    plan["resources"] == chosen
                    and plan["rubric"] is None
                    and not plan["assessment_available"]
                )
                assert checked(c.get("/api/paths/" + plan["id"])) == plan
                if args.materials:
                    first = plan["milestones"][0]["id"]
                    assert c.post(f"/api/paths/{plan['id']}/milestones/{first}/material").status_code == 409
                    assert checked(c.get(f"/api/paths/{plan['id']}/materials")) == {"materials": []}
                    if args.progress:
                        assert c.put(f"/api/paths/{plan['id']}/milestones/{first}/completion", json={"done": True}).status_code == 409
                accepted = checked(c.put(f"/api/paths/{plan['id']}/approve"))
                assert accepted["status"] == "approved"
                assert checked(c.put(f"/api/paths/{plan['id']}/approve")) == accepted
                assert checked(c.get("/api/paths/" + plan["id"])) == accepted
                assert learning.get_path(plan["id"])["objective"] == user_goal
                assert (
                    users.get_path_workflow(identities[0], plan["id"])["state_json"][
                        "result"
                    ]
                    == plan
                )
                assert (
                    c.post(
                        "/api/assessments/start", json={"path_id": plan["id"]}
                    ).status_code
                    == 501
                )
                if args.progress:
                    assert c.put(f"/api/paths/{plan['id']}/milestones/{first}/completion", json={"done": True}).status_code == 409
                if args.materials:
                    import jsonschema
                    schema = json.loads(Path("contracts/v0.1/schemas/milestone-material.schema.json").read_text())
                    generated = []
                    for milestone in plan["milestones"]:
                        route = f"/api/paths/{plan['id']}/milestones/{milestone['id']}/material"
                        material = checked(c.post(route))
                        jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(material)
                        assert material["content"]["mode"] == milestone["mode"]
                        assert (material["content"]["practice"] is not None) == (milestone["mode"] == "hands_on")
                        assert set(material["content"]["resource_ids"]) <= set(milestone["resource_ids"])
                        assert material["resources"] == [r for r in plan["resources"] if r["id"] in material["content"]["resource_ids"]]
                        assert checked(c.post(route)) == material
                        wf = users.get_workflow(material["workflow_id"])
                        assert wf["state_json"]["result"] == material
                        generated.append(material)
                    assert checked(c.get(f"/api/paths/{plan['id']}/materials")) == {"materials": generated}
                    report.setdefault("materials", []).append({"mode": mode, "count": len(generated), "saved_reloaded": True})
                    if args.progress:
                        from concurrent.futures import ThreadPoolExecutor
                        def mark(mid, done):
                            return checked(c.put(f"/api/paths/{plan['id']}/milestones/{mid}/completion", json={"done": done}))
                        # Independent milestones submitted together must not lose either flag.
                        with ThreadPoolExecutor(max_workers=3) as pool:
                            list(pool.map(lambda m: mark(m["id"], True), plan["milestones"]))
                        complete = checked(c.get("/api/paths/" + plan["id"]))
                        assert complete["status"] == "completed"
                        assert complete["progress"] == {"completed": len(generated), "total": len(generated), "next_milestone_id": None}
                        assert all(m["done"] for m in learning.get_path(plan["id"])["milestones_json"])
                        assert mark(first, True) == complete
                        assert c.put(f"/api/paths/{plan['id']}/status", json={"status": "in_progress"}).status_code == 409
                        resumed = mark(first, False)
                        assert resumed["status"] == "in_progress" and resumed["progress"]["next_milestone_id"] == first
                        assert resumed["progress"]["completed"] == len(generated) - 1
                        assert checked(c.get("/api/paths/" + plan["id"])) == resumed
                        assert next(p for p in checked(c.get("/api/paths"))["plans"] if p["id"] == plan["id"]) == resumed
                        assert not resumed["assessment_available"]
                        report.setdefault("progress", []).append({"mode": mode, "concurrent_completion": True,
                            "supabase_flags": True, "repeat": True, "reopen_reload_list": True, "no_verified_skill": True})

                report["modes"].append(
                    {
                        "mode": mode,
                        "milestones": len(plan["milestones"]),
                        "outcome": plan["learning_outcome"],
                        "saved_reloaded_accepted": True,
                    }
                )
                print(json.dumps(report["modes"][-1]), flush=True)
            assert (
                c.post(
                    "/api/paths/generate",
                    json={**payload, "resource_ids": [str(uuid4())]},
                ).status_code
                == 422
            )
            _, _, other = identity()
            for route in (
                "/api/resource-searches/" + found["workflow_id"],
                "/api/paths/" + plan["id"],
                *([f"/api/paths/{plan['id']}/materials"] if args.materials else []),
            ):
                assert (
                    c.get(
                        route, headers={"Authorization": "Bearer " + other}
                    ).status_code
                    == 404
                )
            assert (
                c.put(
                    f"/api/paths/{plan['id']}/approve",
                    headers={"Authorization": "Bearer " + other},
                ).status_code
                == 404
            )
            assert (
                c.post(
                    "/api/paths/generate",
                    json=payload,
                    headers={"Authorization": "Bearer " + other},
                ).status_code
                == 404
            )
            if args.materials:
                assert c.post(f"/api/paths/{plan['id']}/milestones/m1/material", headers={"Authorization": "Bearer " + other}).status_code == 404
            if args.progress:
                assert c.put(f"/api/paths/{plan['id']}/milestones/m1/completion", json={"done": True}, headers={"Authorization": "Bearer " + other}).status_code == 404
                assert checked(c.get("/api/paths", headers={"Authorization": "Bearer " + other})) == {"plans": []}
                assert c.put(f"/api/paths/{plan['id']}/milestones/missing/completion", json={"done": True}).status_code == 404
            events = run(
                table("audit_events")
                .select("detail_json")
                .eq("user_id", identities[0]),
                "Check learning audit",
            )
            successful = [
                e["detail_json"]
                for e in events
                if e["detail_json"].get("status") == "succeeded"
            ]
            assert any(e.get("task") == "resource_extract" for e in successful)
            assert sum(e.get("task") == "path_plan" for e in successful) == 3
            if args.materials:
                assert sum(e.get("task") == "lesson" for e in successful) == sum(m["count"] for m in report["materials"])
            report.update(
                owner_checks=True,
                selected_resource_boundary=True,
                audit_linked=True,
                no_assessment=True,
                passed=True,
            )
            if args.keep_for_browser:
                private = Path(args.output).with_suffix(".private.json")
                private.write_text(
                    json.dumps(
                        {
                            "email": email,
                            "password": password,
                            "identities": identities,
                            "posting_id": posting["id"],
                            "analysis_id": analysis["id"],
                            "resource_search_id": found["workflow_id"],
                            "path_id": plan["id"],
                        }
                    )
                )
                private.chmod(0o600)
    finally:
        if not (args.keep_for_browser and report.get("passed")):
            for uid in identities:
                users.delete_user(uid)
                get_client().auth.admin.delete_user(uid)
            if posting:
                jobs.delete_job(posting["id"])
            report["synthetic_data_cleaned"] = True
        Path(args.output).write_text(json.dumps(report, indent=2))
        print(
            "Live learning check:",
            "passed" if report.get("passed") else "failed",
            flush=True,
        )


if __name__ == "__main__":
    main()
