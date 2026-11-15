from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb

from database import DBError, intake
from database.migrate import migrate


def actor(db):
    user = intake.user_for_subject(db, uuid4())["id"]
    intake.record_consent(db, user, "v1")
    return user


def journey(db, user=None):
    user = user or actor(db)
    goal = intake.create_goal(
        db,
        user,
        target_role="Analyst",
        location="Remote",
        seniority="Junior",
        learning_objective="Analyze data",
        modality="both",
    )
    profile = intake.create_profile(db, user)
    profile = intake.confirm_profile(db, user, profile["id"], 1)
    return (
        user,
        goal,
        profile,
        intake.create_journey(db, user, goal["id"], profile["id"]),
    )


def job(skill):
    return dict(
        provider="greenhouse",
        provider_job_id="1",
        data_origin="live",
        url="https://example.com/job",
        retrieved_at=datetime.now(timezone.utc) - timedelta(days=1),
        title="Analyst",
        description="Requires SQL skills.",
        completeness="full",
        requirements=[
            dict(skill_id=skill, importance="required", excerpt="Requires SQL skills.")
        ],
    )


def search(db, user, j, skill):
    return intake.save_search(
        db, user, j["id"], filters={}, status="available", jobs=[job(skill)]
    )


def test_clean_install_reapply_and_legacy_upgrade(database_url):
    with psycopg.connect(database_url) as conn:
        conn.execute((Path(__file__).parents[1] / "database/schema.sql").read_text())
        user = conn.execute(
            "INSERT INTO users(email) VALUES ('legacy@example.com') RETURNING id"
        ).fetchone()[0]
        skill = conn.execute(
            "INSERT INTO skills(canonical_name) VALUES ('SQL') RETURNING id"
        ).fetchone()[0]
        profile = conn.execute(
            "INSERT INTO candidate_profiles(user_id,source) VALUES (%s,'manual') RETURNING id",
            (user,),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO candidate_skill_evidence(profile_id,skill_id,evidence_type,status) VALUES (%s,%s,'diagnostic','demonstrated')",
            (profile, skill),
        )
        rubric = conn.execute(
            "INSERT INTO rubric_versions(skill_id,version,criteria_json,approval_status,frozen_at) VALUES (%s,1,'{}','frozen',now()) RETURNING id",
            (skill,),
        ).fetchone()[0]
        attempt = conn.execute(
            "INSERT INTO assessment_attempts(user_id,rubric_id,status) VALUES (%s,%s,'passed') RETURNING id",
            (user, rubric),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO verified_skill_evidence(user_id,skill_id,attempt_id,scope) VALUES (%s,%s,%s,'legacy model-reviewed')",
            (user, skill, attempt),
        )
        migrate(conn)
        migrate(conn)
        assert conn.execute("SELECT count(*) FROM schema_migrations").fetchone()[0] == 1
        assert (
            conn.execute(
                "SELECT auth_subject FROM users WHERE id=%s", (user,)
            ).fetchone()[0]
            is None
        )
        assert (
            conn.execute(
                "SELECT contract_version FROM candidate_profiles WHERE id=%s",
                (profile,),
            ).fetchone()[0]
            == 0
        )
        assert (
            conn.execute("SELECT scope FROM verified_skill_evidence").fetchone()[0]
            == "legacy model-reviewed"
        )
        assert conn.execute("SELECT count(*) FROM job_snapshots").fetchone()[0] == 0


def test_owner_isolation_and_immutable_profile(db):
    u, g, p, j = journey(db)
    other = actor(db)
    with pytest.raises(DBError):
        intake.get_profile(db, other, p["id"])
    with pytest.raises(DBError):
        intake.get_journey(db, other, j["id"])
    for statement, args in [
        (
            "UPDATE candidate_profiles SET experience_json=%s WHERE id=%s",
            (Jsonb([{"fake": True}]), p["id"]),
        ),
        ("UPDATE career_goals SET target_role=%s WHERE id=%s", ("Other", g["id"])),
        (
            "INSERT INTO journeys(user_id,goal_id,profile_id,profile_revision) VALUES (%s,%s,%s,%s)",
            (other, g["id"], p["id"], p["revision"]),
        ),
    ]:
        with pytest.raises(psycopg.Error), db.transaction():
            db.execute(statement, args)


def test_revision_and_skill_evidence(db):
    user = actor(db)
    p = intake.create_profile(db, user)
    skill = intake.skill_for_name(db, " SQL ")
    assert intake.skill_for_name(db, "sql")["id"] == skill["id"]
    intake.add_alias(db, skill["id"], " Structured  Query Language ")
    assert intake.skill_for_name(db, "structured query language")["id"] == skill["id"]
    second = intake.skill_for_name(db, "Python")
    with pytest.raises(DBError):
        intake.add_alias(db, second["id"], "SQL")
    with pytest.raises(psycopg.Error), db.transaction():
        intake.add_profile_skill(
            db,
            user,
            p["id"],
            1,
            skill_id=skill["id"],
            source_kind="resume",
            status="demonstrated",
        )
    intake.add_profile_skill(
        db, user, p["id"], 1, skill_id=skill["id"], source_kind="self_reported"
    )
    with pytest.raises(DBError):
        intake.confirm_profile(db, user, p["id"], 1)
    intake.confirm_profile(db, user, p["id"], 2)
    with pytest.raises(psycopg.Error), db.transaction():
        db.execute(
            "UPDATE candidate_skill_evidence SET excerpt='changed' WHERE profile_id=%s",
            (p["id"],),
        )


def test_private_asset_ownership(db):
    user = actor(db)
    other = actor(db)
    a = intake.register_asset(
        db,
        user,
        object_key=f"{user}/resume.pdf",
        media_type="application/pdf",
        sha256="a" * 64,
        size_bytes=12,
    )
    with pytest.raises(DBError):
        intake.get_asset(db, other, a["id"])
    with pytest.raises(psycopg.Error), db.transaction():
        intake.create_profile(db, other, source="resume", file_asset_id=a["id"])


def test_snapshots_cache_and_sources(db):
    u, g, p, j = journey(db)
    skill = intake.skill_for_name(db, "SQL")["id"]
    s = search(db, u, j, skill)
    snap = intake.get_search(db, u, s["id"])["jobs"][0]
    cached = intake.save_search(
        db,
        u,
        j["id"],
        filters={},
        status="available",
        jobs=[{"snapshot_id": snap["id"]}],
        fallback_used=True,
        warnings=["Cached result"],
    )
    reused = intake.get_search(db, u, cached["id"])["jobs"][0]
    assert reused["data_origin"] == "cached"
    assert {k: v for k, v in reused.items() if k != "data_origin"} == {
        k: v for k, v in snap.items() if k != "data_origin"
    }
    for table in ["job_snapshots", "job_searches"]:
        with pytest.raises(psycopg.Error), db.transaction():
            db.execute(f"UPDATE {table} SET updated_at=now()")
    req = db.execute(
        "SELECT * FROM job_skill_requirements WHERE job_snapshot_id=%s", (snap["id"],)
    ).fetchone()
    src = dict(
        job_snapshot_id=str(snap["id"]),
        requirement_id=str(req["id"]),
        excerpt=req["excerpt"],
        importance=req["importance"],
    )
    market = [
        dict(
            skill={"id": str(skill), "canonical_name": "SQL", "category": "technical"},
            sources=[src],
        )
    ]
    gap = intake.save_gap_analysis(
        db,
        u,
        j["id"],
        s["id"],
        existing_skills=[],
        market_skills=market,
        ranked_gaps=[],
        eligible_job_count=1,
    )
    with pytest.raises(DBError):
        intake.get_gap_analysis(db, actor(db), gap["id"])
    market[0]["sources"][0]["excerpt"] = "Invented source"
    with pytest.raises(psycopg.Error), db.transaction():
        intake.save_gap_analysis(
            db,
            u,
            j["id"],
            s["id"],
            existing_skills=[],
            market_skills=market,
            ranked_gaps=[],
            eligible_job_count=1,
        )
    bad = job(skill)
    bad["provider_job_id"] = "2"
    bad["requirements"][0]["excerpt"] = "Invented"
    with pytest.raises(psycopg.Error), db.transaction():
        intake.save_search(db, u, j["id"], filters={}, status="available", jobs=[bad])
    assert db.execute("SELECT count(*) FROM job_snapshots").fetchone()["count"] == 1


def test_cross_search_reference_rejected(db):
    u, g, p, j = journey(db)
    skill = intake.skill_for_name(db, "SQL")["id"]
    s = search(db, u, j, skill)
    other, _, _, j2 = journey(db)
    with pytest.raises(DBError):
        intake.get_search(db, other, s["id"])
    with pytest.raises(DBError):
        intake.save_gap_analysis(
            db,
            other,
            j2["id"],
            s["id"],
            existing_skills=[],
            market_skills=[],
            ranked_gaps=[],
            eligible_job_count=0,
        )


def test_rls_blocks_untrusted_reads(db):
    journey(db)
    db.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO cb_untrusted")
    db.execute("SET LOCAL ROLE cb_untrusted")
    assert db.execute("SELECT * FROM candidate_profiles").fetchall() == []
    assert db.execute("SELECT * FROM journeys").fetchall() == []
    assert db.execute("SELECT * FROM assets").fetchall() == []


def test_reject_conflicting_agent_schema(database_url):
    with psycopg.connect(database_url) as conn:
        conn.execute("CREATE TABLE users(id uuid PRIMARY KEY)")
        with pytest.raises(RuntimeError, match="Unsupported legacy schema"):
            migrate(conn)
        assert (
            conn.execute("SELECT to_regclass('public.schema_migrations')").fetchone()[0]
            is None
        )


def test_journey_before_confirmation_and_revision_tracking(db):
    user = actor(db)
    g = intake.create_goal(
        db,
        user,
        target_role="Analyst",
        location="Remote",
        seniority="Junior",
        learning_objective="Learn",
        modality="both",
    )
    p = intake.create_profile(db, user)
    j = intake.create_journey(db, user, g["id"], p["id"])
    assert j["state"] == "PROFILE_REVIEW"
    with pytest.raises(psycopg.Error), db.transaction():
        intake.save_search(db, user, j["id"], filters={}, status="empty", jobs=[])
    p = intake.confirm_profile(db, user, p["id"], 1)
    j = intake.get_journey(db, user, j["id"])
    assert j["profile_revision"] == p["revision"] and j["state"] == "JOB_SEARCH"


def test_cache_filters_and_staleness(db):
    u, g, p, j = journey(db)
    skill = intake.skill_for_name(db, "SQL")["id"]
    s = search(db, u, j, skill)
    snap = intake.get_search(db, u, s["id"])["jobs"][0]
    with pytest.raises(DBError), db.transaction():
        intake.save_search(
            db,
            u,
            j["id"],
            filters={"role": "other"},
            status="available",
            jobs=[{"snapshot_id": snap["id"]}],
            fallback_used=True,
        )
    old = job(skill)
    old["provider_job_id"] = "old"
    old["retrieved_at"] = datetime.now(timezone.utc) - timedelta(days=8)
    s = intake.save_search(db, u, j["id"], filters={}, status="available", jobs=[old])
    old_id = intake.get_search(db, u, s["id"])["jobs"][0]["id"]
    with pytest.raises(DBError), db.transaction():
        intake.save_search(
            db,
            u,
            j["id"],
            filters={},
            status="available",
            jobs=[{"snapshot_id": old_id}],
            fallback_used=True,
        )


def test_concurrent_profile_confirmation_only_one_wins(db, database_url):
    from concurrent.futures import ThreadPoolExecutor
    from psycopg.rows import dict_row

    user = actor(db)
    p = intake.create_profile(db, user)
    db.commit()

    def confirm():
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            try:
                intake.confirm_profile(connection, user, p["id"], 1)
                return True
            except DBError:
                return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: confirm(), range(2))) == [False, True]


def test_legacy_alias_collision_rolls_back_without_data_loss(database_url):
    with psycopg.connect(database_url) as conn:
        conn.execute((Path(__file__).parents[1] / "database/schema.sql").read_text())
        conn.execute("INSERT INTO skills(canonical_name) VALUES ('SQL'),(' sql ')")
        with pytest.raises(psycopg.Error, match="Ambiguous legacy skill names"):
            migrate(conn)
        assert conn.execute("SELECT count(*) FROM skills").fetchone()[0] == 2
        assert (
            conn.execute("SELECT to_regclass('public.schema_migrations')").fetchone()[0]
            is None
        )


def test_completed_search_membership_cannot_change(db):
    u, _, _, j = journey(db)
    skill = intake.skill_for_name(db, "SQL")["id"]
    s = search(db, u, j, skill)
    other = job(skill)
    other["provider_job_id"] = "second"
    second = intake.save_search(
        db, u, j["id"], filters={}, status="available", jobs=[other]
    )
    snapshot = intake.get_search(db, u, second["id"])["jobs"][0]
    with pytest.raises(psycopg.Error), db.transaction():
        db.execute(
            "INSERT INTO job_search_snapshots VALUES (%s,%s,%s)",
            (s["id"], snapshot["id"], "live"),
        )


def test_search_erasure_preserves_shared_snapshot(db):
    u, _, _, j = journey(db)
    skill = intake.skill_for_name(db, "SQL")["id"]
    s = search(db, u, j, skill)
    with pytest.raises(psycopg.Error), db.transaction():
        db.execute(
            "DELETE FROM job_search_snapshots WHERE job_search_id=%s", (s["id"],)
        )
    db.execute("DELETE FROM users WHERE id=%s", (u,))
    assert db.execute("SELECT count(*) FROM job_searches").fetchone()["count"] == 0
    assert db.execute("SELECT count(*) FROM job_snapshots").fetchone()["count"] == 1
