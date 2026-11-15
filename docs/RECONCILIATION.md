# Stitch reconciliation and validation

> **Upload follow-up:** Résumé extraction now uses the shared gateway with durable audit metadata. See [live résumé setup and verification](RESUME_MODEL.md). The checks below describe the earlier reconciliation snapshot.

## Baseline and scope

The baseline is `stitch-1` at `4ff822772395f11b6b26c3f6efbe500a7402b765`. It already contains the original UI, agent and DB branches plus three newer integration commits. Those commits removed `careerbridge/db.py`, `worker.py` and the static test UI, added `careerbridge/store.py`, and connected the onboarding UI to Supabase-backed legacy routes. Preserve these changes; do not reintroduce the old initializer or rebuild this integration from scratch.

This reconciliation combines that head with PR #22 (`7f63fa6`), whose ancestry includes PR #3 (`f18e1cb`), retaining both histories. It targets `stitch-1`; it does not merge or deploy to `main`. The later `main` prompt additions at `8e81920` remain outside this branch and must be retained when integrating to main.

## What is reused and what remains

| Area | In place | Required for the accepted MVP |
| --- | --- | --- |
| UI | Existing screens/components; real onboarding/profile requests; per-endpoint mock switches | Supabase Auth, canonical generated types, server-owned journey resume/polling; later screens |
| API/store | 32 legacy `/api` paths; Supabase repositories; agent orchestration; CORS/error responses | `/api/v1`, verified JWT ownership on every route, typed async workflows and durable scoped idempotency |
| DB | 18-table development schema and private storage; PR #22's additive migration/intake code | Reviewed SQL migration application, then workflow/template/assessment repository slices |
| Models | PR #22 gateway for OpenAI/Nebius; live OpenAI conformance | Replace agents' direct `ChatOpenAI` construction, validate real task prompts, persist invocation events in DB |
| Assessment | Existing prototype questions, rubric approval and model-reviewed projects | Reviewed competency templates, private grading bundles and deterministic grading; prototype results are not canonical verified evidence |

`contracts/v0.1` is authoritative. Earlier `api/openapi.yaml`, API proposals and stitch integration notes describe legacy behavior. In particular, diagnostic assessment is required by the new MVP even where older notes defer it.

The existing `X-User-Id` header is caller-supplied, not authentication; some legacy read/delete endpoints do not even require that header. Do not expose this prototype as an authenticated service. Current long operations run synchronously; workflow rows and browser-local completion caching do not provide the agreed durable queue/resume semantics. The in-process idempotency cache also lacks the required actor/request scoping and restart durability.

## Changes in this reconciliation

- Keep every current UI and agent source file, including upstream deletions; no new framework or directory migration.
- Add the PR #3 contracts/handoff and PR #22 DB/model gateway modules.
- Combine ignore rules and dependency sets; root `requirements.txt` includes `requirements-wave1.txt` so transactional intake dependencies install with the backend.
- Support `SUPABASE_SECRET_KEY`, with `SUPABASE_KEY` retained for existing server configurations. Expand the environment example without committing credentials or selecting a hardcoded model.
- Preserve current integration docs and mark their legacy contract scope; document this baseline separately.

No live DB writes/migrations, UI rewrites, automatic dependency upgrades or production deployment are part of this change. The initializer guard considered against the older snapshot was discarded because current stitch already removed that code.

## Verification — 2026-11-14

| Check | Result and limit |
| --- | --- |
| Current stitch source | 131 tracked files verified against GitHub blob hashes; all UI/agent source preserved in reconciliation |
| UI | TypeScript and Vite production build passed; ESLint has zero errors and four existing Fast Refresh warnings |
| Python | 40 tests passed: 33 gateway and seven upstream mock-skill tests. 14 SQL integration tests skipped without a disposable test database |
| Contract/lint | 814 contract checks and targeted Python lint passed |
| API and parser | Current app health returned HTTP 200 with database=true; 32 legacy paths, zero `/api/v1` paths; fixture DOCX parsing/mock extraction returned seven skills |
| Supabase development | All 18 tables passed zero-row SDK reads. Private `careerbridge-private` bucket exists. No rows or schema changed |
| OpenAI | Configured `gpt-6-luna` passed three structured extraction cases, one text case and one input-budget probe. A separate real gateway call passed source validation and durably recorded redacted metadata locally. Fallback remained off |
| Dependencies | npm audit reports seven moderate advisories in the TypeScript ESLint/minimatch development chain; none high/critical. No forced upgrades applied |

The OpenAI suite is illustrative, not evidence of production gap-analysis or assessment quality. Refusal/retry/truncation handling was checked with injected responses offline. Early exploratory gateway smoke calls failed because the test harness used the wrong validator callback signature; the corrected `(output, input_data) -> bool` callback passed. Nebius has not been tested live. Capability reports and invocation logs stay in ignored deployment files.

The development database still lacks `journeys`, `assets`, `job_snapshots` and other PR #22 additions. `users.auth_subject` is also absent. `DATABASE_URL` is blank, so SQL migrations and transactional repository tests against that project remain pending. HTTP connectivity is not migration validation. PR #22's earlier 47-test run used disposable PostgreSQL 17, not this Supabase project.

The existing write-heavy `scripts/smoke_test.py` and legacy DB tests were not run against the user's project in this read-only pass. Their commit messages report earlier successful runs; those are not new verification by this reconciliation.

## Setup and next handoff

Install root `requirements.txt` and `requirements-test.txt`; use `.env.example`. Keep server secrets outside `VITE_` variables. The setup checker accepts `SUPABASE_SECRET_KEY` and supports `--no-write`; its default mode writes a test user. The other DB tests and HTTP smoke script should run against disposable test data only.

```sh
python -m pytest tests careerbridge/tests -q
python contracts/v0.1/validate_contract.py
npm run build
npm run lint
```

For live model checks, follow [wave-one setup](WAVE1_IMPLEMENTATION.md#provider-setup-and-use). The gateway does not implicitly load `.env`; export variables or explicitly load the selected file in the launching process. `validate_business(output, input_data)` must return `True` for domain-valid output.

1. **DB-01:** configure the development SQL connection string, review/apply the additive migration, then verify intake transactions and preservation of existing rows. Do not run schema-reset test fixtures against this project.
2. **AF-01:** adapt `main.py` and `store.py` to verified Supabase JWT identity, owner-scoped `database/intake.py`, canonical DTOs, and durable workflow/idempotency records. Wire the gateway and its durable invocation sink; preserve reusable parsing/search functions and focused prompts. Restore one small DB-backed worker for slow jobs as required by the contract; avoid a second persistence system.
3. **UI-01:** retain the existing screens, `src/lib/api` and hooks. Replace mock sign-in/header identity with Supabase Auth, generate/check contract types, and replace `realWorkflowCache` with typed server polling/resume. Keep unavailable features explicit.

Acceptance for this reconciliation is preserved current stitch code, one contract baseline, both histories included, repeatable checks and clear remaining integration. It does not close AF-01/UI-01 or claim an end-to-end canonical MVP.
