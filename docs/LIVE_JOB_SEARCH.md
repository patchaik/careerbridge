# Live job search and gap analysis

This slice advances AF-03 (#10) and UI-02 (#15), building on PR #24. It reuses Keenable search/fetch, the shared model gateway, existing Supabase tables and the existing comparison functions. No new dependency or hosted migration is required.

## Behavior

After profile confirmation, continue through the existing critique screen to `/target`. Enter any role, location (or remote) and seniority. Search returns up to five verifiable postings; `/skills?analysis=<id>` displays saved matches, ranked gaps, exact quotes and original links. Reload reads the saved analysis and job snapshots, without another model call. Search and analysis are explicit actions, never triggered by a results-page reload.

Only role/location/seniority go to Keenable. Job extraction sends bounded public page excerpts through task `job_extract`, prompt/schema `job-requirements-v1`. No résumé or profile skills are sent to that task. The existing gateway owns provider selection, schema validation, retries and deadlines. Source checks reject invented titles, employers, skill names, quotes, duplicate skills and invalid page references. Gap comparison is deterministic; it makes no model call. Missing evidence is never described as inability or verified mastery.

One workflow is created before search, with pinned routing and prompt/schema versions. Invocation metadata is durably logged before posting writes. Search failures remain failures; there is no mock fallback. Empty verified results produce an explicit empty state. Repeated retrievals create separate reference snapshots so a later search cannot replace an earlier report's sources.

## Existing schema mapping and scope

- `career_goals`: role/location/seniority inputs.
- `workflow_runs.state_json`: pinned versions, state, retrieval source, profile and posting IDs.
- `audit_events.detail_json`: redacted gateway invocation metadata.
- `job_postings`: each retrieval snapshot, URL, title, employer, timestamp and `partial` completeness. The legacy provider enum uses `cached`; `provider_job_id` starts with `keenable:` and the API/UI explicitly reports `source: keenable`.
- `job_skill_requirements`: explicit required/preferred skills and exact excerpts.
- `gap_analyses`: existing immutable comparison record; API exposes its job IDs for reload.

The hosted relational schema cannot store `unspecified` importance. Such requirements are excluded, never relabeled as preferred. The UI explains that this is a comparison of explicit requirements from partial excerpts. Supporting unspecified importance needs a reviewed schema migration. Skill matching currently uses canonical-name equality, not semantic equivalence. Matching the requested role/location/seniority is model-assisted, not independently verified; listings may be stale.

Search and analysis require a confirmed, owned profile and owned goal. Gap reload is owner-scoped. Authentication still uses the existing development `X-User-Id` boundary; verified JWT identity, `/api/v1` integration, durable async work/idempotency and full shared-contract acceptance remain follow-ups. Interests and critique still use the existing labeled mock endpoints. This PR does not close AF-01/UI-01/AF-03/UI-02 or enable learning for arbitrary skills.

## Setup

1. Copy `deployment/job-model-routing.example.yaml` to ignored `deployment/job-model-routing.yaml`. Set the server-selected profile and configured model/key environment variables. OpenAI and Nebius use the same gateway; no provider code lives in the UI.
2. With credentials exported, run `python -m scripts.check_job_model --profile openai` (or `nebius`). This makes billable synthetic normal, empty, adversarial and budget probes and writes a seven-day capability report. A prompt/model/schema change needs a fresh report.
3. Set `CAREERBRIDGE_SEARCH_MODE=live`. `JOB_MODEL_ROUTING_PATH` optionally selects a different routing file. `KEENABLE_API_KEY` is optional for the existing public endpoints. Keep `VITE_USE_MOCKS=false` and point `VITE_API_BASE_URL` at the API.
4. Restart the API after changes. The service remains synchronous; a search can take several minutes when source pages are slow. Provider failures offer retry, without substituting fixture data.

## Acceptance and checks

- A role change changes the retrieved evidence; no RAG-specific dependency in the live path.
- Unconfirmed profiles and other users' goals/profiles/reports are rejected.
- Gateway failures do not persist invented postings; unsupported quotes/skills fail validation.
- Persisted requirements retain exact quotes; gaps cite the matching stored postings.
- A results-page reload uses saved data and makes no new model call.
- UI shows progress, blocks duplicate submission and explains failures/empty results.

Validated on 2026-11-14:

- 73 Python tests passed (gateway, job source validation, ownership/confirmation, failure handling, résumé regressions and existing mock tests); 814 offline shared-contract checks passed.
- TypeScript and Vite production build passed; ESLint has zero errors and four existing Fast Refresh warnings. Targeted Python lint passed.
- OpenAI `gpt-6-luna` passed the actual job prompt/schema conformance fixtures and budget probe. Nebius was not tested live.
- Live HTTP résumé upload, confirmation, Keenable search, gap analysis and Supabase reload passed for Python backend engineer (two postings) and Registered Nurse (one posting). Role changes produced distinct results. Exact stored requirement quotes, source IDs, model audit linkage and owner rejection were verified.
- The browser walkthrough passed from a synthetic manual profile through confirmation, target entry, live search, cited gaps and reload. A rejected model extraction was visibly reported; retry succeeded. Reload did not create another successful model invocation or search workflow.
- Synthetic users, profiles/files, reports and their created job snapshots were cleaned up. No hosted schema migration was applied.

Model extraction is not perfectly reliable: some live attempts failed source/schema validation even after the bounded repair. They were rejected without fake results. Later diagnostic calls and retry passed; the intermittent rejection was not reproduced in the diagnostic inputs and is not claimed fixed. This remains a reliability limitation alongside synchronous search latency.

To repeat the HTTP/Supabase check on a development environment, export its credentials and run `python -m scripts.check_job_flow --base-url http://127.0.0.1:8000 --output /tmp/job-flow-check.json`. It creates disposable synthetic users, makes billable model/search requests for two roles, verifies persistence and cleans up its own records. The browser screenshot is retained in the local task outputs, not committed.
