# Resource-grounded learning plans

This learning slice supersedes the earlier reviewed-template prerequisite. Templates,
publication and assessment rubrics are not required to generate or accept a plan.
They remain a separate future boundary for independent competency verification.

## User flow and acceptance criteria

1. Select a skill from an owned gap analysis. Discover resources with both free and
   paid queries, using Keenable and the shared gateway's `resource_extract` task.
2. Save resource URLs, titles, access classifications, exact access/coverage quotes,
   formats and check times. Show free, paid, mixed and unknown separately. Empty
   groups are valid; never invent resources or pad to five. Price evidence is a
   retrieval-time observation, not a guarantee or human curriculum review.
3. Select 1–10 saved resources. Free options are selected by default; paid options
   require learner selection. No purchase or enrollment is performed by CareerBridge.
4. Enter a skill-specific learning goal, 10–600 characters after trimming, and select
   text, hands-on or both. Example: “Use SQL joins to combine customer and order
   data and explain unmatched rows.” This is distinct from the target career role.
5. The `path_plan` task uses the selected saved metadata, goal, modality and profile
   skill names. It produces a concrete expected learning outcome and 1–5 ordered
   milestones with instructions, resource IDs and 1–3 observable self-checks each.
   Text and hands-on plans contain only the selected mode; both contains both modes.
   New URLs and unselected resource IDs are rejected. Hands-on tasks are suggestions
   to perform outside the app; no code execution or automatic grading is added.
6. Review and accept the saved plan. Reload returns the same goal, outcome,
   modalities, instructions and resource snapshot without another model/search call.
   To change content, create another plan. Acceptance is safely repeatable.
7. All new reads/writes enforce ownership. A failed provider call produces a failed
   workflow and retryable error, with no mock success. Saved resources remain usable.
   Acceptance never creates or freezes a rubric or marks a skill demonstrated.
   Independent assessment of these plans returns `409 assessment_unavailable`.

## Deployed API

The current FastAPI application retains synchronous `/api` routes. The broader
`contracts/v0.1/openapi.*` specification describes the future `/api/v1` transport;
this change does not add a worker, durable idempotency for generation or a queue.
The exact deployed learning schemas are in `api/openapi.yaml`.

| Route | Request / result |
| --- | --- |
| `POST /api/resources/search` | `{analysis_id, skill}` → owned saved resource search |
| `GET /api/resource-searches/{workflow_id}` | Reload original grouped resource snapshot |
| `POST /api/paths/generate` | `{resource_search_id, learning_goal, modality, resource_ids}` → 201 proposed plan |
| `GET /api/paths/{path_id}` | Reload owned plan with current status |
| `PUT /api/paths/{path_id}/approve` | Accept immutable content; no body, no rubric operation |

The plan returns `objective` (the learner's exact trimmed goal), `learning_outcome`,
`modality`, detailed `milestones`, selected `resources`, `resource_search_id`,
`workflow_id`, `rubric: null`, and `assessment_available: false`.

## Storage and modules

No new database table or migration is required for this slice.

- `learning_resources` remains the shared current catalog, upserted by skill + URL.
- An owned `discover_resources` workflow stores immutable grouped resource metadata
  and evidence. `verified_at` records a link/content check, not human review.
- `learning_paths` stores the skill, goal, status and legacy milestone summaries.
- The owned `generate_path` workflow stores the complete immutable plan result,
  including resource snapshots. `users.get_path_workflow` reads it by owner and
  result path ID. The current path status overlays that snapshot on GET.
- Route validation stays in `main.py`; persistence orchestration in `store.py`;
  discovery in `search_agent.py`; planning schemas/checks in `learning_coach.py`;
  concise versioned prompts in `prompts/resources.py` and `prompts/learning_plan.py`.
  `model_tasks.py` shares pinned routing, audit recording and gateway cleanup.

A failed completion attempts to remove its newly created path. Process termination
between path creation and snapshot completion can leave an orphan summary row;
transactional completion/recovery is a later infrastructure task. The UI disables
repeat submits while pending, but generation is not durably idempotent across tabs.

## Local configuration and checks

Keep keys in the server `.env`; never in Vite configuration. Copy the two deployment
examples to `resource-model-routing.yaml` and `plan-model-routing.yaml`. Both support
OpenAI/Nebius through the same gateway, with cross-provider fallback disabled.

With credentials exported, from repository root:

```sh
python -m scripts.check_resource_model --profile openai
python -m scripts.check_plan_model --profile openai
python -m pytest tests -q
python contracts/v0.1/validate_contract.py
npm run build
npm run lint
python -m scripts.check_learning_flow --base-url http://127.0.0.1:8003 --output learning-check.json
```

Live checks incur provider calls and require a development/test Supabase project.
They seed a clearly synthetic job gap, then use real resource discovery, extraction,
all three planning modalities, saved records, acceptance, ownership and audit checks.
Synthetic learner data is cleaned by default; `--keep-for-browser` writes a private
local fixture file for a subsequent UI check. Never commit it. Shared public resource
catalog entries are retained; pre-existing user records are not deleted.

Video resources can be opened on their provider's site. Inline video players,
generated videos, interactive lessons, tutor delivery and graded activities are
outside this implementation. Plans already present goals and milestones visually.

## Validation for this change

- 82 Python tests passed; 14 isolated PostgreSQL migration tests were skipped because
  `TEST_DATABASE_URL` was not configured. Live persistence was tested separately
  against the configured development Supabase project.
- 811 offline contract checks passed. Live saved resource/plan payloads validated
  against the deployed API schemas.
- OpenAI conformance passed for resource extraction and all three plan modalities.
  Live discovery returned 2 free, 2 paid and 1 unknown-price resource. All three
  plans passed generation, persistence, reload, repeated acceptance, cross-user
  denial and assessment-block checks. Nebius remains configurable, not live-tested.
- Browser flow passed on reconciled `stitch-1`: gap selection, live discovery,
  paid-resource opt-in, skill goal, both modalities, acceptance and full-page reload.
  Supabase confirmed the exact goal, both price types, both modes, approved status
  and one successful planning invocation. Disposable test identities/data were removed.
- TypeScript and production build passed. Lint has no errors; the 9 existing
  Fast Refresh warnings and Vite's bundle-size warning remain.
- Reconciled upstream UI through `dbb5f47`. Fixed a reproduced journey hydration
  race using a keyed per-user provider so route guards wait for restored progress.
