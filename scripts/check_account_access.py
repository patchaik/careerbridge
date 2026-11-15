"""Verify account and workflow access with two disposable Supabase learners."""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from supabase import create_client

from database import users
from database.client import get_client


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if os.getenv("CAREERBRIDGE_ENV") not in {"development", "test"}:
        parser.error("Use development/test Supabase")
    if urlsplit(args.base_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("Use a local test API")

    admin = get_client().auth.admin
    identities = []
    report = {"passed": False}

    def learner():
        email, password = f"access-test-{uuid4().hex}@example.com", uuid4().hex + "Aa!7"
        created = admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": "Disposable access test",
                    "consent": True,
                },
            }
        )
        identities.append(created.user.id)
        auth = create_client(
            os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]
        ).auth
        session = auth.sign_in_with_password(
            {"email": email, "password": password}
        ).session
        return created.user.id, {"Authorization": "Bearer " + session.access_token}

    try:
        owner, owner_headers = learner()
        other, other_headers = learner()
        account = f"/api/users/{owner}"
        missing = f"/api/users/{uuid4()}"
        with httpx.Client(base_url=args.base_url, timeout=30, trust_env=False) as c:

            def expect(method, path, status, headers=None, **kwargs):
                res = c.request(method, path, headers=headers, **kwargs)
                assert res.status_code == status, (method, res.status_code, status)
                return res.json() if res.content else None

            expect("GET", "/api/progress", 200, owner_headers)
            expect("GET", "/api/progress", 200, other_headers)
            workflow = users.create_workflow(owner)
            users.save_workflow_state(
                workflow["id"], "LEARNING", {"result": {"private_marker": "test-only"}}
            )
            status_url = f"/api/workflows/{workflow['id']}"
            for method, path, absent in [
                ("GET", account, missing),
                ("GET", f"{account}/export", f"{missing}/export"),
                ("DELETE", account, missing),
                ("GET", status_url, f"/api/workflows/{uuid4()}"),
            ]:
                expect(method, path, 401)
                expect(method, path, 401, {"X-User-Id": owner})
                expect(method, path, 401, {"Authorization": "Bearer invalid"})
                assert expect(method, path, 404, other_headers) == expect(
                    method, absent, 404, other_headers
                )
            assert expect("GET", account, 200, owner_headers)["id"] == owner
            assert (
                expect("GET", f"{account}/export", 200, owner_headers)["user"]["id"]
                == owner
            )
            status = expect("GET", status_url, 200, owner_headers)
            assert (
                status["workflow_id"] == workflow["id"]
                and status["state"] == "LEARNING"
            )
            assert "private_marker" not in json.dumps(status)
            report.update(
                signed_out_denied=True,
                header_and_invalid_token_denied=True,
                nonowner_denied=True,
                denied_delete_preserved_records=True,
                owner_reads_work=True,
            )

            attempts = [
                (
                    "/api/users",
                    {"email": f"disabled-{uuid4().hex}@example.com", "consent": True},
                ),
                (
                    "/api/arena/tutor",
                    {
                        "path_id": str(uuid4()),
                        "milestone_id": "m1",
                        "message": "A hint",
                    },
                ),
                ("/api/assessments/start", {"path_id": str(uuid4())}),
                ("/api/assessments/submit", {"attempt_id": str(uuid4())}),
            ]
            for path, payload in attempts:
                for headers in (None, owner_headers, other_headers):
                    expect("POST", path, 501, headers, json=payload)
            assert users.get_user_by_email(attempts[0][1]["email"]) is None
            report["legacy_routes_disabled"] = True

            expect("DELETE", account, 204, owner_headers)
            assert (
                users.get_user(owner) is None
                and users.get_workflow(workflow["id"]) is None
            )
            assert (
                expect("GET", f"/api/users/{other}", 200, other_headers)["id"] == other
            )
            report.update(
                owner_delete_works=True, other_account_untouched=True, passed=True
            )
    finally:
        for uid in identities:
            if users.get_user(uid):
                users.delete_user(uid)
            admin.delete_user(uid)
        report["disposable_accounts_cleaned"] = True
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
