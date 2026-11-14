"""
CareerBridge: end-to-end test of the db/ data layer against Supabase.

Walks the full product flow with a throwaway user, skill and job, checks every
integrity rule, then deletes everything it created (including stored files).

Usage (from the repo root):
  pip install -r requirements.txt
  python3 tests/test_db_layer.py
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import DBError, admin, jobs, learning, mastery, profiles, resumes, users  # noqa: E402
from db.client import run, table  # noqa: E402

TAG = uuid.uuid4().hex[:8]
SKILL = f"CBTest RAG {TAG}"
HAVE = f"CBTest Python {TAG}"
results = []
created = {"skills": [], "jobs": [], "rubrics": [], "user": None}


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))


def expect_error(name, fn, contains=""):
    try:
        fn()
    except DBError as exc:
        ok = contains.lower() in str(exc).lower()
        check(name, ok, str(exc) if not ok else "refused as expected")
        return
    check(name, False, "was allowed but should have been refused")


def step(title):
    print(f"\n{title}")


def main():
    print(f"CareerBridge data layer test  (run {TAG})")
    if not admin.health_check():
        check("Database and storage reachable", False, "run tests/test_db_setup.py first")
        return finish()
    check("Database and storage reachable", True)

    step("A. Identity and goals")
    user = users.create_user(f"cbtest-{TAG}@example.invalid", "Layer test")
    created["user"] = user["id"]
    check("create_user", user and user["id"])
    check("create_user is idempotent",
          users.create_user(user["email"])["id"] == user["id"])
    g1 = users.create_goal(user["id"], "Data Engineer")
    goal = users.create_goal(user["id"], "Software Engineer, AI Applications", modality="both")
    check("New goal deactivates the old one",
          users.get_active_goal(user["id"])["id"] == goal["id"]
          and not users.get_goal(g1["id"])["is_active"])
    expect_error("Bad modality refused",
                 lambda: users.create_goal(user["id"], "X", modality="video"), "modality")

    step("B. Candidate profile")
    profile = profiles.create_profile(user["id"], "resume", parsed_text="test résumé",
                                      file_bytes=b"%PDF-1.4 test", file_name="cv.pdf")
    check("Profile with stored résumé file", profile.get("file_ref", "").endswith(".pdf"))
    check("Signed URL for résumé", profiles.resume_file_url(profile["id"]).startswith("http"))
    have = profiles.add_skill_evidence(profile["id"], HAVE, "resume", "5 years Python",
                                       "present")
    created["skills"].append(have["skill_id"])
    gap_ev = profiles.add_skill_evidence(profile["id"], SKILL, "resume")
    created["skills"].append(gap_ev["skill_id"])
    check("Missing skill defaults to not_established", gap_ev["status"] == "not_established")
    expect_error("Cannot self-set 'demonstrated'",
                 lambda: profiles.add_skill_evidence(profile["id"], SKILL, "resume",
                                                     status="demonstrated"), "demonstrated")
    profiles.add_alias(gap_ev["skill_id"], f"cbtest-alias-{TAG}")
    check("Alias lookup", (profiles.find_skill(f"cbtest-alias-{TAG}") or {}).get("id")
          == gap_ev["skill_id"])
    check("confirm_profile", profiles.confirm_profile(profile["id"])["confirmed_at"])

    step("C. Market evidence")
    job = jobs.upsert_job_posting({"provider": "synthetic", "provider_job_id": f"cbtest-{TAG}",
                                   "title": "Test AI Engineer", "company": "Test Co",
                                   "url": "https://example.com/cbtest"})
    created["jobs"].append(job["id"])
    again = jobs.upsert_job_posting({"provider": "synthetic", "provider_job_id": f"cbtest-{TAG}",
                                     "title": "Test AI Engineer (updated)",
                                     "url": "https://example.com/cbtest"})
    check("Job upsert deduplicates", again["id"] == job["id"])
    expect_error("Job without URL refused",
                 lambda: jobs.upsert_job_posting({"provider": "synthetic",
                                                  "provider_job_id": "x", "title": "x"}), "url")
    reqs = jobs.add_job_requirements(job["id"], [
        {"skill": SKILL, "importance": "required", "excerpt": "Build RAG pipelines"},
        {"skill": HAVE, "importance": "required", "excerpt": "Strong Python"}])
    check("Job requirements saved", len(reqs) == 2)
    expect_error("Requirement without excerpt refused",
                 lambda: jobs.add_job_requirements(job["id"], [{"skill": SKILL,
                                                                "importance": "required"}]),
                 "excerpt")
    analysis = jobs.create_gap_analysis(goal["id"], profile["id"], [job["id"]], [HAVE],
                                        [HAVE, SKILL], [{"skill": SKILL, "job_ids": [job["id"]],
                                                         "importance": "required"}])
    check("Gap analysis saved", analysis["id"])
    report = jobs.gap_report(analysis["id"])
    check("Gap traces to job excerpt",
          report["gaps"][0]["sources"][0]["excerpt"] == "Build RAG pipelines")
    expect_error("Gap citing an unknown job refused",
                 lambda: jobs.create_gap_analysis(goal["id"], profile["id"], [job["id"]], [], [],
                                                  [{"skill": SKILL,
                                                    "job_ids": [str(uuid.uuid4())]}]),
                 "not in this analysis")
    expect_error("More than 10 gaps refused",
                 lambda: jobs.create_gap_analysis(goal["id"], profile["id"], [job["id"]], [], [],
                                                  [{"skill": f"s{i}", "job_ids": [job["id"]]}
                                                   for i in range(11)]), "maximum is 10")

    step("D. Learning")
    path = learning.create_path(goal["id"], SKILL, "Build a small RAG pipeline",
                                [{"id": "m1", "title": "Embeddings"}])
    check("Learning path proposed", path["status"] == "proposed")
    check("Path approved",
          learning.update_path_status(path["id"], "approved")["status"] == "approved")
    learning.add_resource(SKILL, {"title": "Test resource", "url": "https://example.com/r1",
                                  "price_type": "free"})
    check("Resources listed", len(learning.list_resources(SKILL, "free")) == 1)

    step("E. Mastery and evidence")
    draft = mastery.create_rubric(SKILL, {"quiz": {"pass_score": 0.8}})
    created["rubrics"].append(draft["id"])
    expect_error("Attempt on draft rubric refused",
                 lambda: mastery.start_attempt(user["id"], draft["id"]), "frozen")
    expect_error("Freeze before review refused",
                 lambda: mastery.freeze_rubric(draft["id"]), "reviewed")
    mastery.approve_rubric(draft["id"])
    frozen = mastery.freeze_rubric(draft["id"])
    check("Rubric frozen", frozen["approval_status"] == "frozen" and frozen["frozen_at"])
    expect_error("Frozen rubric cannot be edited",
                 lambda: mastery.update_rubric_draft(frozen["id"], {"x": 1}), "frozen")
    expect_error("Database trigger blocks direct edit",
                 lambda: run(table("rubric_versions").update({"criteria_json": {}})
                             .eq("id", frozen["id"]), "Direct edit"), "frozen")

    failed = mastery.start_attempt(user["id"], frozen["id"])
    mastery.submit_attempt(failed["id"], "failed", score={"quiz": 0.5})
    expect_error("Evidence from failed attempt refused",
                 lambda: mastery.record_verified_evidence(failed["id"], "quiz"), "passed")
    key = f"attempt-{TAG}"
    attempt = mastery.start_attempt(user["id"], frozen["id"], idempotency_key=key)
    check("Same idempotency key returns same attempt",
          mastery.start_attempt(user["id"], frozen["id"], idempotency_key=key)["id"]
          == attempt["id"])
    passed = mastery.submit_attempt(attempt["id"], "passed", score={"quiz": 0.9})
    resub = mastery.submit_attempt(attempt["id"], "failed")
    check("Repeat submit keeps first result", passed["status"] == resub["status"] == "passed")
    evidence = mastery.record_verified_evidence(attempt["id"], "simulated project",
                                                "Built a 3-document RAG pipeline")
    check("Verified evidence recorded", evidence["id"])
    status = next(e["status"] for e in profiles.list_skill_evidence(profile["id"])
                  if e["skill_id"] == gap_ev["skill_id"])
    check("Skill now 'demonstrated'", status == "demonstrated", status)

    step("F. Résumé")
    change = {"section": "Skills", "after": "RAG (verified project)",
              "evidence_id": evidence["id"]}
    fake_id = str(uuid.uuid4())
    expect_error("Change citing unverified evidence refused",
                 lambda: resumes.create_resume_draft(
                     profile["id"], [{**change, "evidence_id": fake_id}], [fake_id]),
                 "verified evidence")
    draft_cv = resumes.create_resume_draft(profile["id"], [change], [evidence["id"]])
    check("Résumé draft created", draft_cv["status"] == "draft")
    expect_error("Export before approval refused",
                 lambda: resumes.record_export(draft_cv["id"], b"%PDF-1.4", "cv.pdf"),
                 "approved")
    resumes.approve_resume(draft_cv["id"])
    exported = resumes.record_export(draft_cv["id"], b"%PDF-1.4 export", "cv.pdf",
                                     idempotency_key=f"export-{TAG}")
    check("Export stored", exported["status"] == "exported" and exported["export_file_ref"])
    check("Repeat export with same key is safe",
          resumes.record_export(draft_cv["id"], b"x", "cv.pdf",
                                idempotency_key=f"export-{TAG}")["id"] == draft_cv["id"])

    step("Reports")
    data = admin.export_user_data(user["id"])
    check("export_user_data", len(data["verified_evidence"]) == 1)

    return finish()


def cleanup():
    step("Cleanup")
    try:
        if created["user"]:
            check("delete_user (cascade + files)", users.delete_user(created["user"]))
            check("No rows left for test user",
                  not run(table("assessment_attempts").select("id")
                          .eq("user_id", created["user"]), "Check cascade"))
        for jid in created["jobs"]:
            jobs.delete_job(jid)
        for rid in created["rubrics"]:
            run(table("rubric_versions").delete().eq("id", rid), "Delete test rubric")
        for sid in created["skills"]:
            run(table("skills").delete().eq("id", sid), "Delete test skill")
        check("Test reference data removed", True)
    except DBError as exc:
        check("Cleanup", False, f"{exc} (rows tagged {TAG} may remain)")


def finish():
    failed = [r for r in results if not r[1]]
    print("\n" + "-" * 50)
    if failed:
        print(f"{len(failed)} of {len(results)} checks failed:")
        for name, _, detail in failed:
            print(f"  - {name}: {detail}")
        return 1
    print(f"All {len(results)} checks passed. Data layer is working.")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except DBError as exc:
        print(f"\nStopped: {exc}")
        code = 1
    finally:
        cleanup()
    failed = [r for r in results if not r[1]]
    if failed and code == 0:
        code = finish()
    sys.exit(code)
