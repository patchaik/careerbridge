"""PostgreSQL persistence for profiles and background jobs."""
import os

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def initialize():
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                id UUID PRIMARY KEY,
                skills JSONB NOT NULL DEFAULT '[]',
                confirmed_at TIMESTAMPTZ
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workflows (
                id UUID PRIMARY KEY,
                profile_id UUID NOT NULL REFERENCES profiles(id),
                kind TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                stage TEXT NOT NULL DEFAULT 'queued',
                file_type TEXT,
                file_data BYTEA,
                input JSONB,
                error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)


        conn.execute("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS result JSONB")
        conn.execute("""CREATE TABLE IF NOT EXISTS learning_paths (
            id UUID PRIMARY KEY, profile_id UUID NOT NULL REFERENCES profiles(id),
            goal TEXT NOT NULL, milestones JSONB NOT NULL, rubric JSONB NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1, approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS job_analyses (
            id UUID PRIMARY KEY, profile_id UUID NOT NULL REFERENCES profiles(id),
            result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS resource_searches (
            id UUID PRIMARY KEY, profile_id UUID NOT NULL REFERENCES profiles(id),
            analysis_id UUID NOT NULL REFERENCES job_analyses(id), skill TEXT NOT NULL,
            result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
        conn.execute("ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS resource_search_id UUID REFERENCES resource_searches(id)")
        conn.execute("""CREATE TABLE IF NOT EXISTS assessment_sets (
            id UUID PRIMARY KEY, path_id UUID NOT NULL UNIQUE REFERENCES learning_paths(id),
            rubric_revision INTEGER NOT NULL, questions JSONB NOT NULL, project_task TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS assessment_attempts (
            id UUID PRIMARY KEY, path_id UUID NOT NULL REFERENCES learning_paths(id),
            rubric JSONB NOT NULL, rubric_revision INTEGER NOT NULL,
            submission JSONB NOT NULL, result JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")


def create_upload(workflow_id, profile_id, file_type, data):
    with connect() as conn:
        conn.execute("INSERT INTO profiles (id) VALUES (%s)", (profile_id,))
        conn.execute("""INSERT INTO workflows (id, profile_id, kind, file_type, file_data)
                        VALUES (%s, %s, 'parse_resume', %s, %s)""",
                     (workflow_id, profile_id, file_type, data))


def get_workflow(workflow_id):
    with connect() as conn:
        return conn.execute("""SELECT id, profile_id, kind, status, stage, error, result
                               FROM workflows WHERE id = %s""", (workflow_id,)).fetchone()


def get_profile(profile_id):
    with connect() as conn:
        return conn.execute("SELECT id, skills, confirmed_at FROM profiles WHERE id = %s",
                            (profile_id,)).fetchone()


def enqueue_confirmation(workflow_id, profile_id, skills):
    with connect() as conn:
        profile = conn.execute("SELECT confirmed_at, skills FROM profiles WHERE id = %s FOR UPDATE",
                               (profile_id,)).fetchone()
        if not profile:
            return "missing"
        ready = conn.execute("""SELECT 1 FROM workflows WHERE profile_id = %s
                                AND kind = 'parse_resume' AND status = 'completed'""",
                             (profile_id,)).fetchone()
        if not ready:
            return "not_ready"
        # Retain a resume excerpt only when the user kept the original extraction.
        original = profile["skills"]
        resolved = []
        for skill in skills:
            match = next((item for item in original if all(
                item.get(key) == skill.get(key) for key in ("name", "category", "evidence")
            )), None)
            resolved.append(match if match else {**skill, "evidence": None, "source": "user"})
        if profile["confirmed_at"]:
            previous = conn.execute("""SELECT id FROM workflows WHERE profile_id = %s
                AND kind = 'confirm_profile' AND status = 'completed' ORDER BY created_at DESC LIMIT 1""",
                (profile_id,)).fetchone()
            return str(previous["id"]) if resolved == original and previous else "not_ready"
        pending = conn.execute("""SELECT id, input FROM workflows WHERE profile_id = %s
                                  AND kind = 'confirm_profile' AND status IN ('queued', 'running')""",
                               (profile_id,)).fetchone()
        if pending:
            return str(pending["id"]) if pending["input"] == resolved else "not_ready"
        conn.execute("""INSERT INTO workflows (id, profile_id, kind, input)
                        VALUES (%s, %s, 'confirm_profile', %s)""",
                     (workflow_id, profile_id, Jsonb(resolved)))
        return str(workflow_id)


def set_stage(workflow_id, stage):
    with connect() as conn:
        conn.execute("UPDATE workflows SET stage = %s, updated_at = now() WHERE id = %s",
                     (stage, workflow_id))


def claim():
    with connect() as conn:
        return conn.execute("""UPDATE workflows SET status = 'running', updated_at = now()
            WHERE id = (SELECT id FROM workflows WHERE status = 'queued'
                        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING *""").fetchone()


def finish(job, skills, confirmed=False, mock=False):
    with connect() as conn:
        conn.execute("""UPDATE profiles SET skills = %s,
                        confirmed_at = CASE WHEN %s THEN now() ELSE confirmed_at END
                        WHERE id = %s""", (Jsonb(skills), confirmed, job["profile_id"]))
        conn.execute("""UPDATE workflows SET status = 'completed', stage = %s,
                        file_data = NULL, input = NULL, updated_at = now() WHERE id = %s""",
                     ("confirmed" if confirmed else "awaiting_profile_confirmation_mock" if mock
                      else "awaiting_profile_confirmation", job["id"]))


def fail(workflow_id, message="Processing failed. Check the document and server configuration."):
    with connect() as conn:
        conn.execute("""UPDATE workflows SET status = 'failed', stage = 'failed',
                        error = %s, file_data = NULL, input = NULL, updated_at = now() WHERE id = %s""",
                     (message, workflow_id))


def enqueue(workflow_id, profile_id, kind, payload):
    with connect() as conn:
        profile = conn.execute("SELECT confirmed_at FROM profiles WHERE id = %s", (profile_id,)).fetchone()
        if not profile or not profile["confirmed_at"]:
            return False
        conn.execute("INSERT INTO workflows (id, profile_id, kind, input) VALUES (%s, %s, %s, %s)",
                     (workflow_id, profile_id, kind, Jsonb(payload)))
        return True


def get_path(path_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM learning_paths WHERE id = %s", (path_id,)).fetchone()


def get_attempt(attempt_id):
    with connect() as conn:
        return conn.execute("""SELECT id, path_id, rubric_revision, result, created_at
                               FROM assessment_attempts WHERE id = %s""", (attempt_id,)).fetchone()


def complete_workflow(conn, job, result, stage="completed"):
    conn.execute("""UPDATE workflows SET status = 'completed', stage = %s, result = %s,
                    input = NULL, updated_at = now() WHERE id = %s""",
                 (stage, Jsonb(result), job["id"]))


def save_path(job, path_id, goal, result):
    with connect() as conn:
        conn.execute("""INSERT INTO learning_paths (id, profile_id, goal, milestones, rubric, resource_search_id)
                        VALUES (%s, %s, %s, %s, %s, %s)""",
                     (path_id, job["profile_id"], goal, Jsonb(result["milestones"]), Jsonb(result["rubric"]), job["input"]["resource_search_id"]))
        complete_workflow(conn, job, {"path_id": str(path_id)}, "awaiting_rubric_approval")


def revise_path(job, result):
    with connect() as conn:
        row = conn.execute("""UPDATE learning_paths SET goal = %s, milestones = %s, rubric = %s,
            revision = revision + 1 WHERE id = %s AND profile_id = %s AND approved_at IS NULL
            RETURNING id, revision""", (job["input"]["goal"], Jsonb(result["milestones"]),
            Jsonb(result["rubric"]), job["input"]["path_id"], job["profile_id"])).fetchone()
        if not row:
            raise ValueError("Path cannot be revised")
        complete_workflow(conn, job, {"path_id": str(row["id"]), "revision": row["revision"]}, "awaiting_rubric_approval")


def approve_path(job):
    with connect() as conn:
        row = conn.execute("""UPDATE learning_paths SET approved_at = now()
            WHERE id = %s AND profile_id = %s AND approved_at IS NULL AND revision = %s
            RETURNING id, revision""", (job["input"]["path_id"], job["profile_id"], job["input"]["revision"])).fetchone()
        if not row:
            raise ValueError("Rubric revision is unavailable")
        complete_workflow(conn, job, {"path_id": str(row["id"]), "revision": row["revision"]}, "rubric_approved")


def save_attempt(job, result, expected_revision):
    with connect() as conn:
        path = conn.execute("""SELECT * FROM learning_paths WHERE id = %s AND profile_id = %s
                               AND approved_at IS NOT NULL FOR UPDATE""",
                            (job["input"]["path_id"], job["profile_id"])).fetchone()
        if not path or path["revision"] != expected_revision:
            raise ValueError("Approved rubric unavailable")
        count = conn.execute("SELECT count(*) AS count FROM assessment_attempts WHERE path_id = %s AND (result->>'passed')::boolean = false", (path["id"],)).fetchone()["count"]
        if count >= 3:
            raise ValueError("Assessment retry limit reached")
        result["remediation_cycles_remaining"] = max(0, 3 - count - (not result["passed"]))
        if not result["passed"] and result["remediation_cycles_remaining"] == 0:
            result["next_step"] = "Automatic retries are exhausted; choose alternate instruction or human review."
        source = conn.execute("SELECT result->>'source' AS source FROM resource_searches WHERE id = %s", (path["resource_search_id"],)).fetchone() if path["resource_search_id"] else None
        if result["passed"] and not result.get("mock") and source and source["source"] != "synthetic":
            result["evidence"] = {"competency": path["rubric"]["competency"], "scope": path["rubric"]["scope"], "assessment_type": "model-reviewed project"}
        conn.execute("""INSERT INTO assessment_attempts (id, path_id, rubric, rubric_revision, submission, result)
                        VALUES (%s, %s, %s, %s, %s, %s)""",
                     (job["id"], path["id"], Jsonb(path["rubric"]), path["revision"], Jsonb(job["input"]["submission"]), Jsonb(result)))
        complete_workflow(conn, job, {"attempt_id": str(job["id"])}, "assessment_complete")



def save_discovery(job, kind, result):
    with connect() as conn:
        if kind == "search_jobs":
            conn.execute("INSERT INTO job_analyses (id, profile_id, result) VALUES (%s, %s, %s)",
                         (job["id"], job["profile_id"], Jsonb(result)))
            output = {"analysis_id": str(job["id"])}
        else:
            conn.execute("""INSERT INTO resource_searches (id, profile_id, analysis_id, skill, result)
                            VALUES (%s, %s, %s, %s, %s)""",
                         (job["id"], job["profile_id"], job["input"]["analysis_id"],
                          job["input"]["skill"], Jsonb(result)))
            output = {"resource_search_id": str(job["id"])}
        complete_workflow(conn, job, output)


def get_analysis(analysis_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM job_analyses WHERE id = %s", (analysis_id,)).fetchone()


def get_resource_search(search_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM resource_searches WHERE id = %s", (search_id,)).fetchone()


def save_assessment_set(job, assessment):
    with connect() as conn:
        path = conn.execute("""SELECT * FROM learning_paths WHERE id = %s AND profile_id = %s
                               AND approved_at IS NOT NULL FOR UPDATE""",
                            (job["input"]["path_id"], job["profile_id"])).fetchone()
        if not path:
            raise ValueError("Approved rubric required")
        existing = conn.execute("SELECT id FROM assessment_sets WHERE path_id = %s", (path["id"],)).fetchone()
        if existing:
            complete_workflow(conn, job, {"assessment_set_id": str(existing["id"])}, "assessment_ready")
            return
        conn.execute("""INSERT INTO assessment_sets (id, path_id, rubric_revision, questions, project_task)
                        VALUES (%s, %s, %s, %s, %s)""", (job["id"], path["id"], path["revision"],
                        Jsonb(assessment["questions"]), assessment["project_task"]))
        complete_workflow(conn, job, {"assessment_set_id": str(job["id"])}, "assessment_ready")


def get_assessment_set(set_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM assessment_sets WHERE id = %s", (set_id,)).fetchone()



def get_assessment_set_for_path(path_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM assessment_sets WHERE path_id = %s", (path_id,)).fetchone()
