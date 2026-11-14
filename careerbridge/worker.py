"""Single background worker, backed by the PostgreSQL workflow table."""
import logging
import time

from careerbridge import db
from careerbridge.analyst import analyst
from careerbridge.assessor import assessor, prepare_assessment
from careerbridge.learning_coach import answer_question, coach, remediation
from careerbridge.search_agent import job_search_agent, resource_search_agent

log = logging.getLogger(__name__)


def main():
    logging.basicConfig(level=logging.INFO)
    db.initialize()
    # This lock makes recovery of interrupted jobs safe: only one worker may run.
    with db.connect() as lock_conn:
        acquired = lock_conn.execute("SELECT pg_try_advisory_lock(184177021) AS acquired").fetchone()
        if not acquired["acquired"]:
            raise RuntimeError("A CareerBridge worker is already running")
        lock_conn.commit()
        with db.connect() as conn:
            conn.execute("""UPDATE workflows SET status = 'queued', stage = 'queued',
                            updated_at = now() WHERE status = 'running'""")
        while True:
            job = db.claim()
            if not job:
                time.sleep(1)
                continue
            try:
                if job["kind"] == "parse_resume":
                    result = analyst.invoke({"workflow_id": str(job["id"]),
                                             "file_type": job["file_type"],
                                             "file_data": bytes(job["file_data"])})
                    db.finish(job, result["skills"], mock=result["extraction_mode"] == "mock")
                elif job["kind"] == "confirm_profile":
                    db.set_stage(job["id"], "confirming_profile")
                    db.finish(job, job["input"], confirmed=True)
                elif job["kind"] == "search_jobs":
                    db.set_stage(job["id"], "searching_jobs")
                    profile = db.get_profile(job["profile_id"])
                    result = job_search_agent.invoke({**job["input"], "skills": profile["skills"]})
                    db.save_discovery(job, "search_jobs", result["result"])
                elif job["kind"] == "search_resources":
                    db.set_stage(job["id"], "searching_resources")
                    result = resource_search_agent.invoke({"skill": job["input"]["skill"]})
                    db.save_discovery(job, "search_resources", result["result"])
                elif job["kind"] in ("create_path", "revise_path"):
                    db.set_stage(job["id"], "proposing_learning_path")
                    profile = db.get_profile(job["profile_id"])
                    if job["kind"] == "create_path":
                        search_id = job["input"]["resource_search_id"]
                    else:
                        path = db.get_path(job["input"]["path_id"])
                        search_id = path["resource_search_id"] if path else None
                    resources = db.get_resource_search(search_id) if search_id else None
                    if not resources or resources["profile_id"] != job["profile_id"] or not resources["result"]["free"]:
                        raise ValueError("Free learning resources are required")
                    result = coach.invoke({"goal": job["input"]["goal"], "skills": profile["skills"],
                                           "skill": resources["skill"], "resources": resources["result"]["free"]})
                    if job["kind"] == "create_path":
                        db.save_path(job, job["input"]["path_id"], job["input"]["goal"], result)
                    else:
                        db.revise_path(job, result)
                elif job["kind"] == "approve_rubric":
                    db.set_stage(job["id"], "freezing_rubric")
                    db.approve_path(job)
                elif job["kind"] == "coach_message":
                    db.set_stage(job["id"], "coaching")
                    path = db.get_path(job["input"]["path_id"])
                    if not path or path["profile_id"] != job["profile_id"] or not path["approved_at"]:
                        raise ValueError("Approved rubric required")
                    answer = answer_question(path["goal"], path["milestones"], job["input"]["question"])
                    with db.connect() as conn:
                        db.complete_workflow(conn, job, {"answer": answer}, "coaching_complete")
                elif job["kind"] == "prepare_assessment":
                    db.set_stage(job["id"], "preparing_assessment")
                    path = db.get_path(job["input"]["path_id"])
                    if not path or path["profile_id"] != job["profile_id"] or not path["approved_at"]:
                        raise ValueError("Approved rubric required")
                    existing = db.get_assessment_set_for_path(path["id"])
                    if existing:
                        with db.connect() as conn:
                            db.complete_workflow(conn, job, {"assessment_set_id": str(existing["id"])}, "assessment_ready")
                    else:
                        db.save_assessment_set(job, prepare_assessment(path["rubric"]))
                elif job["kind"] == "assess":
                    db.set_stage(job["id"], "reviewing_submission")
                    path = db.get_path(job["input"]["path_id"])
                    if not path or path["profile_id"] != job["profile_id"] or not path["approved_at"]:
                        raise ValueError("Approved rubric required")
                    assessment = db.get_assessment_set(job["input"]["submission"]["assessment_set_id"])
                    if not assessment or assessment["path_id"] != path["id"] or assessment["rubric_revision"] != path["revision"]:
                        raise ValueError("Assessment does not match approved rubric")
                    result = assessor.invoke({"rubric": path["rubric"], "assessment": assessment,
                                              "submission": job["input"]["submission"]})
                    if not result["result"]["passed"]:
                        result["result"]["remediation"] = remediation(result["result"]["failed_criteria"], path["rubric"])
                    db.save_attempt(job, result["result"], path["revision"])
                else:
                    raise ValueError("Unknown workflow kind")
            except Exception as exc:
                # Do not log exception messages: provider errors can contain resume data.
                log.error("Workflow %s failed (%s)", job["id"], type(exc).__name__)
                known = {"Path cannot be revised", "Rubric revision is unavailable", "Approved rubric required",
                         "Approved rubric unavailable", "Assessment retry limit reached", "Free learning resources are required",
                         "Assessment does not match approved rubric", "Learning plan referenced an unavailable resource"}
                db.fail(job["id"], str(exc) if isinstance(exc, ValueError) and str(exc) in known
                        else "Processing failed. Check the server configuration and input.")


if __name__ == "__main__":
    main()
