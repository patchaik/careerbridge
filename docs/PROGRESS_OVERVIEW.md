# Saved progress and next steps

`GET /api/progress` now adds `summary`, `plans`, `recommendations`, `plan_limit` and
`independently_verified: false` to the existing goal/gaps/evidence/next-action fields.
A new account receives a useful empty response with `goal: null`. Authentication is
required. Database failures remain errors rather than fabricated empty progress.

The Progress page is available to any signed-in learner, including after a fresh
sign-in without local journey history. Learn and completed learning checks link to
it. Resource-discovery links are also sign-in accessible; their APIs still require
ownership of the referenced saved analysis/search.

## Scope and calculation

Reuse the existing latest-50 saved resource-based plan query across the account's
goals. The UI states that limit. Proposed plans appear but are excluded from milestone
and accepted-plan completion totals. Completion and learning-check results are separate:
a missed question does not undo completed work; completing work does not verify mastery.
No new migration, model call, generated prompt, persistent recommendation, or dependency.

Read learning checks once for the owned path IDs. Return only scores, criterion counts,
and milestone review suggestions. Never include private answer keys, submitted text,
model routing, or raw check workflows. Repeated reads do not modify any data.

For each saved completed check, group incorrect quiz explanations and unmet practice
criteria's saved next steps by milestone. Show all grouped suggestions under the plan;
the primary recommendation links to its first flagged milestone. Feedback text is
rendered as plain text. Links are built from owned IDs, never model-provided URLs.

Recommend up to five actions, in this order:

1. Revisit milestones flagged by a saved check.
2. Resume saved answers with pending feedback.
3. Continue the next incomplete milestone (including a reopened or paused plan).
4. Open a learning check for a completed plan without results.
5. Review and accept a proposed plan.
6. Start an unaddressed skill from the active goal's latest saved gap analysis,
   required skills before preferred skills, then highest job frequency.

Preserve saved-plan order for ties. Existing plans and independently verified evidence
prevent duplicate new-skill suggestions, using case-insensitive skill matching.
A successful formative check never changes a profile or closes a job-market skill gap.
The existing `demonstrated` gap status still requires independent verified evidence.
With nothing actionable, offer profile/goal setup or review of saved learning.

Recommendations reflect saved results. Revisiting a lesson does not erase a missed
answer or change the immutable check. Retakes and recording resolved review suggestions
remain deferred. No overall mastery percentage or pass threshold is invented.

## Acceptance and verification

- Empty account, active goal without analysis, and existing saved plans load correctly.
- Proposed plans do not dilute completion totals; zero milestones show no percentage.
- Wrong quiz answers and unmet practice criteria map to the correct milestone and
  are deduplicated; perfect checks do not trigger remediation or mastery writes.
- Pending feedback resumes the existing check; reopened milestones preserve old results.
- New skills use only the active goal's owned analysis, with stable priority and safe links.
- Authenticated users see only their data; no answer keys or responses in the overview.
- Progress and destination links work after reload/fresh sign-in; failures show retry UI.
- Database and model invocation counts do not change when reading progress.

Run `python -m pytest tests/test_progress_overview.py` for deterministic cases. The
existing `scripts.check_learning_check_flow` now verifies the overview, schema,
privacy, replay, account isolation and no additional model calls after live checks
for text, hands-on and both. Its plans/material are explicitly synthetic fixtures;
this test does not rerun resource discovery. Browser checks cover recommendations,
linked material, saved results, reload and resource-discovery entry without fetching
new resources just to test a link.
