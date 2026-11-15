"""v0.1 intake repositories. Call inside a transaction; actor comes from verified JWT.

Legacy modules retain their old interfaces. New API code uses this module and must
not call legacy unscoped reads. These functions return storage records, not API DTOs.
"""

import json
from functools import lru_cache
from pathlib import Path
from uuid import UUID

from jsonschema import Draft202012Validator, FormatChecker

from psycopg import sql
from psycopg.types.json import Jsonb

from .client import DBError


def _one(conn, query, args=()):
    row = conn.execute(query, args).fetchone()
    if row is None:
        raise DBError("Record not found or revision conflict")
    return row


def _insert(conn, table, values):
    # Table/column names are internal constants, never HTTP inputs.
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
        sql.Identifier(table),
        sql.SQL(",").join(map(sql.Identifier, values)),
        sql.SQL(",").join(sql.Placeholder() for _ in values),
    )
    return _one(conn, query, tuple(values.values()))


def user_for_subject(conn, auth_subject, display_name=""):
    """Called only after JWT verification; never link legacy accounts by email."""
    return _one(
        conn,
        """INSERT INTO users(auth_subject,display_name) VALUES (%s,%s)
        ON CONFLICT (auth_subject) DO UPDATE SET auth_subject=excluded.auth_subject RETURNING *""",
        (UUID(str(auth_subject)), display_name),
    )


def record_consent(conn, user_id, version):
    if not version.strip():
        raise DBError("Consent version is required")
    return _one(
        conn,
        "UPDATE users SET consent_at=now(),consent_version=%s WHERE id=%s AND auth_subject IS NOT NULL RETURNING *",
        (version, user_id),
    )


@lru_cache(maxsize=1)
def _schemas():
    return json.loads(
        (
            Path(__file__).resolve().parents[1] / "contracts/v0.1/openapi.json"
        ).read_text()
    )["components"]


def _validate_fields(name, fields):
    components = _schemas()
    properties = components["schemas"][name]["properties"]
    for field, value in fields.items():
        schema = {**properties[field], "components": components}
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(value)


def create_goal(
    conn, user_id, *, target_role, location, seniority, learning_objective, modality
):
    _validate_fields(
        "GoalCreate",
        dict(
            target_role=target_role,
            location=location,
            seniority=seniority,
            learning_objective=learning_objective,
            modality=modality,
        ),
    )
    return _insert(
        conn,
        "career_goals",
        dict(
            user_id=user_id,
            target_role=target_role,
            location=location,
            seniority=seniority,
            learning_goal=learning_objective,
            modality=modality,
            contract_version=1,
        ),
    )


def skill_for_name(conn, name, category="technical"):
    # Lock normalized spelling, not a process-local cache, to handle concurrent aliases.
    normalized = conn.execute("SELECT normalize_skill(%s)", (name,)).fetchone()[
        "normalize_skill"
    ]
    if not normalized:
        raise DBError("Skill name is required")
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (normalized,))
    row = conn.execute(
        "SELECT s.* FROM skills s JOIN skill_names n ON n.skill_id=s.id WHERE n.normalized_name=%s",
        (normalized,),
    ).fetchone()
    return row or _insert(
        conn, "skills", dict(canonical_name=" ".join(name.split()), category=category)
    )


def add_alias(conn, skill_id, alias):
    return _one(
        conn,
        """INSERT INTO skill_names(normalized_name,skill_id) VALUES (normalize_skill(%s),%s)
        ON CONFLICT (normalized_name) DO UPDATE SET skill_id=skill_names.skill_id
        WHERE skill_names.skill_id=excluded.skill_id RETURNING *""",
        (alias, skill_id),
    )


def register_asset(conn, user_id, *, object_key, media_type, sha256, size_bytes):
    """Metadata only: caller uploads privately and removes staged bytes on failure."""
    return _insert(
        conn,
        "assets",
        dict(
            owner_user_id=user_id,
            object_key=object_key,
            media_type=media_type,
            sha256=sha256,
            size_bytes=size_bytes,
        ),
    )


def get_asset(conn, user_id, asset_id):
    return _one(
        conn,
        "SELECT * FROM assets WHERE id=%s AND owner_user_id=%s",
        (asset_id, user_id),
    )


def create_profile(
    conn, user_id, *, source="manual", experience=None, file_asset_id=None
):
    return _insert(
        conn,
        "candidate_profiles",
        dict(
            user_id=user_id,
            source=source,
            experience_json=Jsonb(experience or []),
            file_asset_id=file_asset_id,
            contract_version=1,
        ),
    )


def get_profile(conn, user_id, profile_id):
    return _one(
        conn,
        "SELECT * FROM candidate_profiles WHERE id=%s AND user_id=%s AND contract_version=1",
        (profile_id, user_id),
    )


def edit_profile(conn, user_id, profile_id, expected_revision, experience):
    return _one(
        conn,
        """UPDATE candidate_profiles SET experience_json=%s, revision=revision+1
        WHERE id=%s AND user_id=%s AND revision=%s AND status='draft' AND contract_version=1 RETURNING *""",
        (Jsonb(experience), profile_id, user_id, expected_revision),
    )


def add_profile_skill(
    conn,
    user_id,
    profile_id,
    expected_revision,
    *,
    skill_id,
    source_kind,
    excerpt=None,
    status="self_reported",
):
    _one(
        conn,
        """SELECT id FROM candidate_profiles WHERE id=%s AND user_id=%s AND revision=%s
        AND contract_version=1 AND status='draft' FOR UPDATE""",
        (profile_id, user_id, expected_revision),
    )
    return _insert(
        conn,
        "candidate_skill_evidence",
        dict(
            profile_id=profile_id,
            skill_id=skill_id,
            evidence_type=source_kind,
            excerpt=excerpt,
            status=status,
        ),
    )


def confirm_profile(conn, user_id, profile_id, expected_revision):
    return _one(
        conn,
        """UPDATE candidate_profiles SET status='confirmed', confirmed_at=now(),revision=revision+1
        WHERE id=%s AND user_id=%s AND revision=%s AND status='draft' AND contract_version=1 RETURNING *""",
        (profile_id, user_id, expected_revision),
    )


def create_journey(conn, user_id, goal_id, profile_id):
    profile = get_profile(conn, user_id, profile_id)
    return _insert(
        conn,
        "journeys",
        dict(
            user_id=user_id,
            goal_id=goal_id,
            profile_id=profile_id,
            profile_revision=profile["revision"],
            state="JOB_SEARCH"
            if profile["status"] == "confirmed"
            else "PROFILE_REVIEW",
            next_action="search_jobs"
            if profile["status"] == "confirmed"
            else "confirm_profile",
        ),
    )


def get_journey(conn, user_id, journey_id):
    return _one(
        conn, "SELECT * FROM journeys WHERE id=%s AND user_id=%s", (journey_id, user_id)
    )


def save_search(
    conn,
    user_id,
    journey_id,
    *,
    filters,
    status,
    jobs,
    warnings=(),
    fallback_used=False,
):
    """One immutable search and all source records, committed by caller's transaction.

    A cached job may use an existing snapshot_id; it keeps that snapshot's original
    retrieval time and provenance. fallback_used/warnings describe cache use.
    """
    get_journey(conn, user_id, journey_id)
    if len(jobs) > 20 or (status == "available") != bool(jobs):
        raise DBError("Search status and job count disagree")
    search = _insert(
        conn,
        "job_searches",
        dict(
            user_id=user_id,
            journey_id=journey_id,
            normalized_filters_json=Jsonb(filters),
            status=status,
            warnings_json=Jsonb(list(warnings)),
            fallback_used=fallback_used,
        ),
    )
    for job in jobs:
        if set(job) == {"snapshot_id"}:
            if not fallback_used:
                raise DBError("Cache reuse must be labeled")
            snapshot = _one(
                conn,
                """SELECT j.* FROM job_snapshots j WHERE j.id=%s AND j.data_origin<>'synthetic'
                AND j.retrieved_at>=now()-interval '7 days' AND EXISTS (
                  SELECT 1 FROM job_search_snapshots ss JOIN job_searches s ON s.id=ss.job_search_id
                  WHERE ss.job_snapshot_id=j.id AND s.normalized_filters_json=%s)""",
                (job["snapshot_id"], Jsonb(filters)),
            )
        else:
            fields = {
                k: job[k]
                for k in (
                    "provider",
                    "provider_job_id",
                    "data_origin",
                    "url",
                    "retrieved_at",
                    "title",
                    "description",
                    "completeness",
                )
            }
            fields.update(company=job.get("company"), location=job.get("location"))
            # Serialize same provider/job; duplicate retrievals must match existing metadata.
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (fields["provider"] + ":" + fields["provider_job_id"],),
            )
            snapshot = conn.execute(
                """SELECT * FROM job_snapshots WHERE provider=%s AND provider_job_id=%s
                AND retrieved_at=%s AND description_sha256=encode(digest(%s,'sha256'),'hex')""",
                (
                    fields["provider"],
                    fields["provider_job_id"],
                    fields["retrieved_at"],
                    fields["description"],
                ),
            ).fetchone()
            if snapshot:
                raise DBError(
                    "Snapshot already exists; explicitly reuse its snapshot_id"
                )
            snapshot = _insert(conn, "job_snapshots", fields)
            for req in job.get("requirements", []):
                _insert(
                    conn,
                    "job_skill_requirements",
                    dict(
                        job_snapshot_id=snapshot["id"],
                        skill_id=req["skill_id"],
                        importance=req["importance"],
                        excerpt=req["excerpt"],
                    ),
                )
        _insert(
            conn,
            "job_search_snapshots",
            dict(
                job_search_id=search["id"],
                job_snapshot_id=snapshot["id"],
                data_origin="cached"
                if set(job) == {"snapshot_id"}
                else snapshot["data_origin"],
            ),
        )
    return _one(
        conn,
        "UPDATE job_searches SET sealed=true WHERE id=%s RETURNING *",
        (search["id"],),
    )


def get_search(conn, user_id, search_id):
    search = _one(
        conn,
        "SELECT * FROM job_searches WHERE id=%s AND user_id=%s AND sealed",
        (search_id, user_id),
    )
    search["jobs"] = conn.execute(
        """SELECT j.*,s.data_origin FROM job_snapshots j JOIN job_search_snapshots s ON s.job_snapshot_id=j.id
        WHERE s.job_search_id=%s ORDER BY j.id""",
        (search_id,),
    ).fetchall()
    return search


def save_gap_analysis(
    conn,
    user_id,
    journey_id,
    search_id,
    *,
    existing_skills,
    market_skills,
    ranked_gaps,
    eligible_job_count,
    warnings=(),
):
    _validate_fields(
        "GapAnalysis",
        dict(
            existing_skills=existing_skills,
            market_skills=market_skills,
            ranked_gaps=ranked_gaps,
            eligible_job_count=eligible_job_count,
            warnings=list(warnings),
        ),
    )
    if len({g["id"] for g in ranked_gaps}) != len(ranked_gaps):
        raise DBError("Duplicate gap IDs")
    journey = get_journey(conn, user_id, journey_id)
    search = get_search(conn, user_id, search_id)
    if search["journey_id"] != journey["id"]:
        raise DBError("Search does not belong to journey")
    for item in existing_skills:
        skill = item["skill"]
        stored = _one(conn, "SELECT * FROM skills WHERE id=%s", (skill["id"],))
        if (
            stored["canonical_name"] != skill["canonical_name"]
            or stored["category"] != skill["category"]
            or item["status"] == "demonstrated"
        ):
            raise DBError("Existing skill does not match intake evidence")
        for evidence in item["evidence"]:
            if evidence["source_record_id"] is not None:
                raise DBError("Verified evidence links are added by DB-03, not intake")
            _one(
                conn,
                """SELECT id FROM candidate_skill_evidence WHERE profile_id=%s AND skill_id=%s
                AND evidence_type=%s AND excerpt IS NOT DISTINCT FROM %s AND status=%s""",
                (
                    journey["profile_id"],
                    skill["id"],
                    evidence["kind"],
                    evidence["excerpt"],
                    item["status"],
                ),
            )
    return _insert(
        conn,
        "gap_analyses",
        dict(
            contract_version=1,
            user_id=user_id,
            journey_id=journey_id,
            goal_id=journey["goal_id"],
            profile_id=journey["profile_id"],
            profile_revision=journey["profile_revision"],
            job_search_id=search_id,
            existing_skills_json=Jsonb(existing_skills),
            market_skills_json=Jsonb(market_skills),
            ranked_gaps_json=Jsonb(ranked_gaps),
            eligible_job_count=eligible_job_count,
            warnings_json=Jsonb(list(warnings)),
        ),
    )


def get_gap_analysis(conn, user_id, gap_id):
    return _one(
        conn,
        "SELECT * FROM gap_analyses WHERE id=%s AND user_id=%s AND contract_version=1",
        (gap_id, user_id),
    )
