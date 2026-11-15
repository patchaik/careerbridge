# Milestone learning material

After accepting a resource-based plan, the learner can generate material for each
milestone on `/learn?path=<id>`. One explicit click generates one lesson. For a
combined plan, each milestone keeps its own text or hands-on mode.

- Text: a concrete objective, short explanations, worked example and self-checks.
- Hands-on: the same foundation plus setup, actionable practice steps and a deliverable.
- Suggested self-check answers are expandable. They are learning aids, not private
  assessment keys, grading, certification or demonstrated-skill evidence.
- Resource links come from that milestone's immutable plan snapshot. Generated
  teaching uses saved descriptions/excerpts plus model knowledge, not full external
  course content. Paid links retain their labels; no purchase, enrollment, scraping
  of paid lessons, code execution, video generation or chat tutor is added.

## Contract and storage

`POST /api/paths/{path_id}/milestones/{milestone_id}/material` has no body. It checks
consent, ownership, acceptance, milestone membership and saved resource references.
It uses task `lesson` through the shared model gateway with pinned provider routing,
prompt/schema versions and durable invocation audit. The model cannot choose new
resource IDs or switch modality. The response contains identity/timestamp fields,
structured `content` and the cited saved resource snapshots.

`GET /api/paths/{path_id}/materials` returns `{materials: [...]}` in milestone order.
It is owner-scoped and never invokes a model. Repeating POST after success returns
the same saved material. Material is stored in an owned `generate_lesson` workflow,
reusing `workflow_runs.state_json`; no new table or migration is required. Existing
plan content, acceptance and assessment boundaries remain unchanged.

See [deployed OpenAPI](../api/openapi.yaml) and the standalone
[material schema](../contracts/v0.1/schemas/milestone-material.schema.json).
The broader `/api/v1` transport remains a future integration.

The single-process MVP rejects concurrent generation for the same user/path/milestone
with 409 and clears the in-flight entry after success or failure. The saved snapshot
survives restarts. A process crash before saving, or simultaneous requests handled by
multiple server processes, can still cause another billable generation. Distributed
locking and transactional workflow recovery remain follow-ups. Provider failures save
failed workflow state and expose retry; they never overwrite accepted plans or saved
lessons. No regeneration endpoint is added.

## Setup and verification

1. Copy `deployment/lesson-model-routing.example.yaml` to ignored
   `deployment/lesson-model-routing.yaml`, or set `LESSON_MODEL_ROUTING_PATH`.
2. Configure model/key environment variables locally. OpenAI and Nebius share the
   existing gateway; cross-provider fallback stays disabled unless configured.
3. Run `python -m scripts.check_lesson_model --profile openai` (or `nebius`) to
   generate a local capability report for the exact route. Restart the API.
4. In development/test, run `python -m scripts.check_learning_flow --materials
   --output learning-material-check.json`. This seeds a synthetic gap and exercises
   live resource discovery, plans, acceptance, every milestone, all three modalities,
   schema validation, owner rejection, repeat POST, GET reload and Supabase audit.
   Disposable learner data is cleaned by default; shared public resources remain.

Acceptance: generation before acceptance is rejected; changing owners or milestone
IDs cannot read/generate another learner's material; all cited resources belong to
that milestone; text never gets practice steps and hands-on always does; refresh and
repeat requests preserve content without another successful model invocation;
failed generation leaves the plan/resources available for retry. Existing plans can
use the feature after deployment once the lesson route is configured.
