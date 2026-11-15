# Formative learning checks

After completing a resource-based plan, the learner can check understanding with
five multiple-choice questions and one short written practice response. Questions
use the plan goal, milestone criteria and saved generated material. Text plans ask
for explanation/application; hands-on and combined plans can ask for a code/query
or design excerpt with an explanation. Code is not executed and links/files are
not inspected.

The quiz is scored in code against a server-held, AI-generated answer key. Written
feedback is AI-generated, with an exact excerpt from the submitted response for
any criterion marked met, an explanation and a concrete next step. Neither the
answer key nor AI feedback has been independently reviewed. Results are learning
guidance, not certification, pass/fail mastery, or verified skill evidence.

## API and persistence

- `GET /api/paths/{path_id}/learning-check` returns `{check: null}` before a check
  exists, otherwise the saved public check. GET never invokes a model.
- `POST /api/paths/{path_id}/learning-check` creates or resumes the one saved check
  for this plan. All milestones must be complete and have saved material before
  initial generation. Each generated question references an existing milestone.
- `POST /api/learning-checks/{check_id}/submit` takes `quiz_answers` (question ID to
  zero-based integer option index) and `practice_response` (10–8000 characters after
  trimming). Exactly the check's five question IDs must be present. Extra fields,
  string/boolean option indices, invalid choices and blank responses are rejected.
- Public check states: `new`, `generating`, `ready`, `grading`, `feedback_pending`,
  `completed`. Answer keys and explanations are excluded from public questions;
  graded quiz explanations/expected answers are returned with the saved final result.
- Submitted answers are immutable. Identical repeat submissions return the saved
  result without another model call; changed answers return 409. There is one check
  per plan in this slice; retakes are deferred. Unsubmitted form answers are not saved.
- If feedback fails, answers and deterministic quiz results remain saved. Retry uses
  those same answers. Reload restores the check, submitted response and feedback.
  Existing results remain readable if a milestone is reopened, but first submission
  requires all milestones complete. Reads/writes require authenticated ownership;
  generation/feedback also require processing consent.

See [deployed OpenAPI](../api/openapi.yaml) and the standalone
[public response schema](../contracts/v0.1/schemas/learning-check.schema.json).
`LearningPath.assessment_available` continues to describe the independent assessment
path; it stays false. The new learning-check endpoints are a separate formative flow.

Reuse `workflow_runs`, with `state_json.kind=learning_check`. Its ID is derived from
the path UUID; insert-on-conflict does not overwrite another request. Private state
holds the plan/material input snapshot, generated keys, routing/prompt versions,
submitted answers, deterministic score, feedback and trace IDs. Owner-scoped API
projection excludes private fields. RLS already blocks direct public table reads.
No migration, new dependency or mastery-table changes are required.

A revision-checked conditional update commits each transition atomically. A five-minute
lease prevents duplicate concurrent generation/submission across processes; an expired
lease permits retry after a worker crash. A stale worker cannot overwrite a newer
revision. A crash after a model response but before persistence can require another
billable call; this is not exactly-once model execution. Database/transport errors
remain visible, and failed writes never return a fabricated successful result.

## Model setup and tracing

```sh
cp deployment/check-model-routing.example.yaml deployment/check-model-routing.yaml
python -m scripts.check_learning_check_model --profile openai
```

Load `.env` first as described in [local setup](LOCAL_E2E.md), or use its dotenv/runpy
wrapper. Use `--profile nebius` and change the local route's active profile to switch
providers. Both tasks use the shared gateway: `check_prepare` and `check_feedback`.
A normal check takes two model calls, one to prepare and one for written feedback;
provider/schema retries follow the gateway's existing bounds. Scoring, reads and
successful repeat requests use no model calls. Capability checks include normal,
unsupported-response and prompt-injection fixtures. Reports expire after seven days.
Input is bounded by the gateway; oversized material fails explicitly, not by silent
truncation. No prompt or new provider-specific adapter is embedded in the UI/routes.

Existing Langfuse instrumentation records named prepare/feedback traces, nested
per-attempt generations, model/token usage, prompt/schema versions and workflow
correlation. Raw lesson content, answer keys and learner responses are omitted from
telemetry; they remain in server-owned Supabase state. Tracing remains optional.

## Acceptance and testing

- Completion/material gates; owner isolation for every endpoint; no keys before results.
- Five distinct questions, valid choices, all milestones covered and existing
  self-check wording not copied verbatim. Criteria reference saved milestones.
- Exact deterministic scores for fully correct, fully incorrect and mixed answers.
- Criterion IDs must match the saved task; supporting excerpts must occur verbatim
  in the submitted response. Missing evidence cannot produce `met=true`.
- Concurrent start, replay, changed-answer rejection, failure/retry and expired lease
  recovery preserve one saved check and its immutable submission.
- No verified evidence, assessment-attempt rows, profile skill promotion or résumé edits.
- Browser: complete plan → start check → answer quiz/write practice → submit → feedback
  → reload/revisit the plan. Saved results survive API restart.

```sh
python -m pytest tests/test_learning_checks.py
python -m scripts.check_learning_check_flow --base-url http://127.0.0.1:8000 --output learning-check-check.json
```

The live script uses disposable learners and explicitly synthetic saved plans/material
in all three modalities, then exercises real HTTP, model generation/feedback, Supabase
persistence, concurrent starts, ownership and audit counts. It isolates the new slice;
`check_learning_flow --progress` covers real upstream search/plan/material generation.
Disposable private records are cleaned by default. Live quality checks are smoke tests,
not a calibrated or independent validation of the AI assessor's educational accuracy.
