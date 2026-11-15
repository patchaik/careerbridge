# Saved learning progress

For accepted resource-based plans, each milestone has a server-owned `done` flag.
Work through its generated material and success criteria, then mark it complete.
Completion is self-reported practice, not assessment, certification or demonstrated
skill evidence. It does not change the profile or unlock assessments.

## Deployed contract

- `GET /api/paths`: `{plans: LearningPath[]}`, newest first, limited to the owner's
  50 most recent paths. Only resource-based plan snapshots are returned.
- Plan generation, acceptance, GET, list and completion return `milestones[].done`
  and `progress: {completed, total, next_milestone_id}`. Next is the first incomplete
  milestone in plan order, or null when finished. Existing plans default to false.
- `PUT /api/paths/{path_id}/milestones/{milestone_id}/completion`, body
  `{"done": true}` (or false to reopen), returns the updated plan. Strict boolean;
  extra fields fail 422. Requires a Supabase bearer token and ownership. Wrong
  owner/path/milestone returns 404; proposed plans or completion without saved
  material return 409. The material need not be regenerated on revisit.
- Completion sets status to `in_progress`, or `completed` when every flag is true.
  Undo reopens a completed plan. Repeating the same request has the same result.
  The legacy status endpoint cannot bypass this rule for resource-based plans.

The [deployed OpenAPI](../api/openapi.yaml) is authoritative for `/api`.
The future `/api/v1` transport is not introduced by this feature.

## Persistence and UI

Reuse `learning_paths.milestones_json[].done`; no migration or model call.
A conditional row update compares both prior milestone JSON and status, updating
flags and status atomically. A conflict reloads and retries up to five times, then
returns 409. A dropped connection during the conditional write also reloads before
retrying, because the write may already have committed. Different milestones edited from separate sessions retain both saves;
for opposing updates to the same milestone, the last successful write wins.
The immutable generated plan and lesson snapshots remain unchanged.

Learn in the navigation opens `/learn` (My learning). It requires authentication,
not browser-local onboarding history, so a new signed-in session can resume an
owned plan. `/learn?path=<id>` shows progress and links to the first incomplete
milestone. Saved material, completion marks and resources reload from the API.
Completion waits for the server; a failed save shows an error without optimistic
progress. Completion controls stay disabled until the material is saved.
Resume is at milestone granularity; reading scroll position, expanded answers,
external editor work and partial practice answers are not tracked.

## Acceptance and checks

Run `python -m pytest tests/test_learning_progress.py` for guards, strict request
validation, old-plan defaults, reload/list, complete/reopen and conflicting saves.
Run `python -m scripts.check_learning_flow --progress --base-url http://127.0.0.1:8000
--output learning-progress-check.json` on a configured development/test project.
This includes live resource discovery, all three plan modalities and material,
concurrent completion of separate milestones, direct Supabase flag checks, repeat
requests, reopening, owner isolation and model audit counts (progress adds no calls).
Disposable accounts are removed by default. Public discovered resources remain.

Browser acceptance: sign in, choose Learn, open an accepted plan, generate any
missing material, complete a milestone, refresh, continue to the next, finish the
plan, undo a completion, sign out/in and resume through Learn. Verify the saved
state and that the plan still says assessment is unavailable.
