# Live résumé extraction

The existing PDF/DOCX upload now calls `ModelGateway.generate_json` through the résumé analyst. The rest of the upload/profile mapping is retained. No model ID is hardcoded; this local deployment uses `OPENAI_MODEL=gpt-6-luna` and the OpenAI route.

`careerbridge/prompts/career_analyst.py` owns the versioned prompt, generated schema and synthetic capability fixtures. Each skill requires an exact source excerpt and a literal skill name within that excerpt. Missing evidence yields an empty list; unsupported or duplicate output fails validation. This conservative extractor does not infer synonyms or implied abilities. The UI's existing confirmation limit is 30 skills.

The store creates one workflow before extraction and persists the pinned routing configuration and prompt/schema versions. The gateway commits redacted invocation metadata through the existing `database.users.log_event` function to `audit_events`; no résumé text or credentials enter that audit event. The same workflow records completion/failure and the successful invocation ID. A failed mandatory audit write prevents returning a model result.

## Configure and validate

1. Install root backend requirements and test requirements. Configure Supabase, `OPENAI_API_KEY` and `OPENAI_MODEL` server-side.
2. Copy `contracts/v0.1/model-routing.example.yaml` to ignored `deployment/model-routing.yaml`. Set `active_profile: openai`, leave cross-provider fallback disabled, and set its OpenAI capability-report path to `deployment/resume-openai-capabilities.json`. Use a separate résumé report path for Nebius when validating that route.
3. Export the server environment or explicitly load the chosen `.env` in the launching process, then run `python -m scripts.check_resume_model --profile openai`. This makes five billable synthetic calls using the actual extraction prompt/schema plus a text transport probe. Reports expire after seven days and are invalidated by fixture/prompt/schema changes.
4. Set `CAREERBRIDGE_ANALYST_MODE=llm` and restart the backend. Keep `CAREERBRIDGE_SEARCH_MODE=mock` if only testing uploads. `MODEL_ROUTING_PATH` optionally selects another server routing file.

The local deployment uses a 32,768 input-token budget enforced conservatively as a UTF-8 byte bound including the prompt/schema, a 4,096-token output ceiling, and a 60-second gateway deadline. Oversized text fails explicitly; it is not silently truncated. The existing 5 MB file limit still applies. Missing/expired reports, model refusal, invalid output or provider failure return an error rather than mock extraction. Explicit `CAREERBRIDGE_ANALYST_MODE=mock` remains available for offline previews.

## Verification and limits

- 56 Python tests passed, including nine extraction/source/audit/failure/consent checks and seven confirmation regressions; 14 SQL integration tests remain skipped without a disposable database.
- The actual résumé capability suite passed on configured OpenAI `gpt-6-luna`.
- A synthetic DOCX uploaded through `/api/onboarding/parse` returned HTTP 201 and SQL evidence; private storage, one completed workflow and its linked durable OpenAI invocation were verified. The synthetic account/profile were deleted after verification.
- UI loading/disabled states now cover the synchronous HTTP request, rather than waiting for the legacy local workflow wrapper.

### Upload and confirmation verification

A live HTTP test used the UI's exact confirmation payload (skill names/statuses, without excerpts). It exposed a bug: confirmation upserted `excerpt=null` over all three valid extraction excerpts. The store now takes résumé evidence from the existing server record, preserves it when omitted by the client, and rejects replacement excerpts or promotion of unsupported skills to résumé evidence. Removal IDs are checked against the current profile before writes.

After the fix, a synthetic résumé uploaded through OpenAI returned HTTP 201, and confirmation returned HTTP 200. Supabase retained all three evidence IDs and exact excerpts:

| Skill | Stored excerpt | Stored source/status |
| --- | --- | --- |
| SQL | I used SQL to query a database. | resume / present |
| Python | I wrote Python scripts. | resume / present |
| Docker | I deployed applications with Docker. | resume / present |

The stored file matched the uploaded bytes, `confirmed_at` was set, API reload matched the saved profile, and replaying the same idempotency key left the response unchanged with exactly one upload workflow and one confirmation workflow. The upload's successful OpenAI invocation remained linked. Synthetic accounts, profiles and uploaded files were removed after both the failing reproduction and passing test.

This tested the running HTTP API with the UI payload and direct Supabase verification, not browser automation. Replay was verified within one server process; restart-safe idempotency remains AF-01 work. Existing excerpts erased before this fix are not reconstructed automatically; re-upload the original résumé to regenerate them. No existing user records were repaired or modified by this test.

This is a local preview on the legacy API: JWT authentication and the canonical durable worker remain AF-01 work. Other agents still use their existing model adapters. No DB migration, new table, new SDK or provider fallback was added. A quoted excerpt establishes source support, not independently verified skill proficiency.

The gateway retains strict schema, refusal and incomplete-response handling described in [OpenAI's structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat), with separate source validation in application code.
