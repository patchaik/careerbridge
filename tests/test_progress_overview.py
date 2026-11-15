import copy
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from careerbridge import main, progress
from database import learning


def plan(pid="p1", status="completed", done=True):
    return {
        "id": pid,
        "goal_id": "g1",
        "skill": "SQL",
        "objective": "Explain joins",
        "status": status,
        "progress": {
            "completed": int(done),
            "total": 1,
            "next_milestone_id": None if done else "m1",
        },
        "milestones": [{"id": "m1", "title": "Join rows", "done": done}],
    }


def check():
    return {
        "path_id": "p1",
        "status": "completed",
        "content": {
            "criteria": [{"id": "c1", "milestone_id": "m1"}],
            "questions": [{"correct_option": 2}],
        },
        "submission": {"practice_response": "Private response"},
        "result": {
            "quiz_score": 4,
            "quiz_total": 5,
            "submitted_at": "2026-11-15T00:00:00Z",
            "quiz": [
                {
                    "correct": False,
                    "milestone_id": "m1",
                    "explanation": "Preserve left rows.",
                }
            ],
            "feedback": {
                "criteria": [
                    {
                        "criterion_id": "c1",
                        "met": False,
                        "next_step": "Try an unmatched row.",
                    }
                ]
            },
        },
    }


@pytest.fixture
def saved(monkeypatch):
    data = {
        "goal": {"id": "g1", "target_role": "Analyst"},
        "analysis": None,
        "plans": [plan()],
        "checks": [check()],
        "verified": [],
    }
    monkeypatch.setattr(
        progress.users,
        "get_active_goal",
        lambda uid: data["goal"] if uid == "owner" else None,
    )
    monkeypatch.setattr(
        progress.jobs, "get_latest_gap_analysis", lambda gid: data["analysis"]
    )
    monkeypatch.setattr(
        progress,
        "list_paths_flow",
        lambda uid: {"plans": data["plans"] if uid == "owner" else []},
    )
    reads = MagicMock(
        side_effect=lambda uid, ids: [
            {"state_json": c}
            for c in data["checks"]
            if uid == "owner" and c["path_id"] in ids
        ]
    )
    monkeypatch.setattr(progress.learning, "list_learning_checks", reads)
    monkeypatch.setattr(
        progress.mastery,
        "list_verified_evidence",
        lambda uid: data["verified"] if uid == "owner" else [],
    )
    return data, reads


def test_saved_results_summary_dedup_and_no_private_answer_keys(saved):
    data, reads = saved
    data["plans"].append(plan("p2", "proposed", False))
    before = copy.deepcopy(data)
    result = progress.get_progress("owner")
    assert result["summary"] == {
        "plans_total": 2,
        "plans_accepted": 1,
        "plans_completed": 1,
        "milestones_completed": 1,
        "milestones_total": 1,
        "checks_completed": 1,
        "plans_to_revisit": 1,
    }
    assert len(result["plans"][0]["revisit"]) == 1
    assert len(result["plans"][0]["revisit"][0]["reasons"]) == 2
    assert result["recommendations"][0]["href"] == "/learn?path=p1#milestone-m1"
    assert result["recommendations"][1]["kind"] == "accept_plan"
    assert "correct_option" not in str(result) and "Private response" not in str(result)
    assert data == before and not result["independently_verified"]
    reads.assert_called_once_with("owner", ["p1", "p2"])


def test_next_gap_rank_and_no_formative_mastery(saved):
    data, _ = saved
    data["checks"][0]["result"]["quiz"][0]["correct"] = True
    data["checks"][0]["result"]["feedback"]["criteria"][0]["met"] = True
    data["analysis"] = {
        "id": "a1",
        "ranked_gaps_json": [
            {"skill": "sql", "importance": "required", "frequency": 5},
            {"skill": "Docker", "importance": "preferred", "frequency": 5},
            {"skill": "C++ / Python", "importance": "required", "frequency": 3},
            {"skill": "Excel", "importance": "required", "frequency": 1},
        ],
    }
    data["verified"] = [
        {"id": "e1", "skills": {"canonical_name": "Excel"}, "verified_at": "today"}
    ]
    result = progress.get_progress("owner")
    assert [r["skill"] for r in result["recommendations"]] == ["C++ / Python", "Docker"]
    assert "skill=C%2B%2B+%2F+Python" in result["recommendations"][0]["href"]
    assert (
        result["gaps"][0]["status"] == "learning"
    )  # Perfect check never closes the gap.
    assert result["gaps"][-1]["status"] == "demonstrated"


def test_incomplete_pending_ready_and_reopened(saved):
    data, _ = saved
    data["checks"] = []
    data["plans"] = [plan(done=False, status="in_progress")]
    assert (
        progress.get_progress("owner")["recommendations"][0]["kind"] == "continue_plan"
    )
    data["plans"] = [plan()]
    assert progress.get_progress("owner")["recommendations"][0]["href"].endswith(
        "#learning-check"
    )
    data["checks"] = [{"path_id": "p1", "status": "feedback_pending"}]
    assert (
        "submitted answers are saved"
        in progress.get_progress("owner")["recommendations"][0]["reason"]
    )
    data["checks"] = [check()]
    data["plans"] = [plan(done=False, status="in_progress")]
    result = progress.get_progress("owner")
    assert result["summary"]["milestones_completed"] == 0
    assert result["summary"]["checks_completed"] == 1
    assert result["plans"][0]["check_result"]["quiz_score"] == 4
    assert result["recommendations"][0]["kind"] == "revisit"


def test_empty_owner_isolation_auth_and_error(saved, monkeypatch):
    client = TestClient(main.app)
    assert client.get("/api/progress").status_code in (401, 403)
    main.app.dependency_overrides[main.current_user_id] = lambda: "other"
    try:
        result = client.get("/api/progress").json()
        assert result["goal"] is None and result["plans"] == []
        assert result["summary"]["milestones_total"] == 0
        assert result["recommendations"][0]["kind"] == "set_goal"
        from database.client import DBError

        monkeypatch.setattr(
            progress.learning,
            "list_learning_checks",
            MagicMock(side_effect=DBError("Unavailable")),
        )
        assert client.get("/api/progress").status_code == 409
    finally:
        main.app.dependency_overrides.clear()


def test_batch_read_is_owner_scoped_and_empty_is_free(monkeypatch):
    query = MagicMock()
    monkeypatch.setattr(learning, "table", MagicMock(return_value=query))
    assert learning.list_learning_checks("owner", []) == []
    learning.table.assert_not_called()
    monkeypatch.setattr(learning, "run", lambda q, name: [])
    learning.list_learning_checks("owner", ["p1"])
    query.select.return_value.eq.assert_called_once_with("user_id", "owner")
    query.select.return_value.eq.return_value.contains.return_value.in_.assert_called_once_with(
        "id", [learning.check_id_for("p1")]
    )


def test_optional_goal_fields_omit_database_nulls(saved):
    data, _ = saved
    data["goal"].update(location=None, seniority=None, learning_goal=None)
    result = progress.get_progress("owner")
    assert result["goal"] == {"id": "g1", "target_role": "Analyst"}


def test_perfect_check_fallback_and_recommendation_cap(saved):
    data, _ = saved
    data["checks"][0]["result"]["quiz"][0]["correct"] = True
    data["checks"][0]["result"]["feedback"]["criteria"][0]["met"] = True
    data["analysis"] = {"id": "a1", "ranked_gaps_json": [{"skill": "SQL"}]}
    result = progress.get_progress("owner")
    assert result["summary"]["plans_to_revisit"] == 0
    assert result["recommendations"][0]["kind"] == "review_learning"
    data["plans"] = [plan(f"p{i}", "paused", False) for i in range(8)]
    data["checks"] = []
    result = progress.get_progress("owner")
    assert len(result["recommendations"]) == 5
    assert all(r["kind"] == "continue_plan" for r in result["recommendations"])
