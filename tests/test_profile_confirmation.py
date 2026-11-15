from unittest.mock import MagicMock

import pytest

from careerbridge import store
from careerbridge.errors import ApiError


@pytest.fixture
def confirmation(monkeypatch):
    row = {
        "id": "evidence",
        "skill_id": "sql",
        "evidence_type": "resume",
        "excerpt": "I used SQL to query a database.",
    }
    monkeypatch.setattr(store.profiles, "get_profile", lambda _: {"user_id": "user"})
    monkeypatch.setattr(store.profiles, "list_skill_evidence", lambda _: [row])
    monkeypatch.setattr(
        store.profiles,
        "find_skill",
        lambda name: {"id": "sql"} if name.lower() == "sql" else None,
    )
    writes = {
        name: MagicMock()
        for name in [
            "add_skill_evidence",
            "delete_skill_evidence",
            "confirm_profile",
            "clear_parsed_text",
        ]
    }
    for name, mock in writes.items():
        monkeypatch.setattr(store.profiles, name, mock)
    monkeypatch.setattr(store, "record_workflow", MagicMock())
    monkeypatch.setattr(store, "profile_response", lambda _: {"confirmed_at": "saved"})
    return row, writes


@pytest.mark.parametrize("status", ["present", "user_confirmed"])
def test_confirmation_without_excerpt_preserves_saved_evidence(confirmation, status):
    row, writes = confirmation
    result = store.confirm_profile_flow(
        "profile", [{"skill": "SQL", "status": status}], [], False, None
    )
    assert result["confirmed_at"]
    writes["add_skill_evidence"].assert_called_once_with(
        "profile", "SQL", "resume", excerpt=row["excerpt"], status=status
    )
    writes["confirm_profile"].assert_called_once_with("profile")


def test_forged_excerpt_is_rejected_before_any_changes(confirmation):
    _, writes = confirmation
    with pytest.raises(ApiError) as error:
        store.confirm_profile_flow(
            "profile",
            [{"skill": "SQL", "status": "present", "excerpt": "Invented experience"}],
            [],
            False,
            None,
        )
    assert error.value.status_code == 422
    for mock in writes.values():
        mock.assert_not_called()


def test_manual_skill_cannot_be_promoted_to_resume_evidence(confirmation):
    _, writes = confirmation
    with pytest.raises(ApiError):
        store.confirm_profile_flow(
            "profile", [{"skill": "Docker", "status": "present"}], [], False, None
        )
    writes["add_skill_evidence"].assert_not_called()
    writes["confirm_profile"].assert_not_called()


def test_self_reported_skill_needs_no_resume_excerpt(confirmation):
    _, writes = confirmation
    store.confirm_profile_flow(
        "profile", [{"skill": "Docker", "status": "self_reported"}], [], False, None
    )
    writes["add_skill_evidence"].assert_called_once_with(
        "profile", "Docker", "self_reported", excerpt=None, status="self_reported"
    )


def test_cannot_delete_evidence_outside_this_profile(confirmation):
    _, writes = confirmation
    with pytest.raises(ApiError) as error:
        store.confirm_profile_flow(
            "profile", [], ["other-profile-evidence"], False, None
        )
    assert error.value.status_code == 404
    for mock in writes.values():
        mock.assert_not_called()


def test_clearing_resume_text_keeps_source_excerpt(confirmation):
    row, writes = confirmation
    store.confirm_profile_flow(
        "profile", [{"skill": "SQL", "status": "present"}], [], True, None
    )
    assert writes["add_skill_evidence"].call_args.kwargs["excerpt"] == row["excerpt"]
    writes["clear_parsed_text"].assert_called_once_with("profile")
