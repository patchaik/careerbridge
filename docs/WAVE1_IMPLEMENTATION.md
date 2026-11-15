# Wave 1: DB-01 and AF-02

This slice adds the intake persistence foundation and provider gateway from issues [#4](https://github.com/Shrezz/careerbridge/issues/4) and [#9](https://github.com/Shrezz/careerbridge/issues/9). It builds on the contract PR, without merging the UI or agent prototype wholesale. No production database or model provider was contacted during implementation.

## What is implemented

- Explicit, checksum-tracked PostgreSQL migrations from an empty Supabase-compatible database or the reviewed `main` schema. Migration and recording are one transaction with an advisory lock; reruns skip applied migrations and reject changed SQL.
- Verified-subject identity, immutable goal/profile snapshots, profile revisions, a shared canonical/alias namespace, owner-checked private-file metadata, journey bindings and immutable job/search/gap evidence.
- One HTTP transport with `generate_json` and `generate_text`, server-selected OpenAI/Nebius routes, pinned model/config revisions, required capability reports, source-validation callbacks, bounded retries and redacted invocation metadata.
- A live conformance command and small example fixtures. The examples exercise the gateway; they are **not production extraction/tutoring prompts** or approved competency content.

## Modules and dependencies

| Module | Responsibility |
| --- | --- |
| `database/migrate.py` | Explicit migration command; never invoked by API/worker startup. |
| `database/migrations/0001_intake_snapshots.sql` | Additive storage changes, composite ownership references and immutable-record guards. |
| `database/intake.py` | Cohesive intake repository functions; explicit authenticated actor and caller-owned transaction. |
| `careerbridge/model_gateway.py` | Provider selection, compatible requests, validation, bounded retries and invocation events. |
| `scripts/check_model_capabilities.py` | Live fixture and budget probes plus offline error-path checks; generates a local deployment report. |
| `tests/` | PostgreSQL integration and provider-boundary tests. |

Psycopg supplies real PostgreSQL transactions for this slice, which the existing Supabase query builder does not expose. HTTPX supplies a single transport for both providers; no second SDK or agent framework is added. YAML/JSON Schema reuse contract tooling. Pytest and Ruff are development-only. Existing Supabase modules remain for legacy code; new API handlers must use the scoped v0.1 repository functions.

## Logical-to-physical DB mapping

| Contract concept | Physical storage / constraint |
| --- | --- |
| User | Existing `users` plus unique `auth_subject`, `display_name` and `consent_version`. Legacy users keep null subject; email is not used to establish identity. |
| Goal | Existing `career_goals`; `learning_goal` maps to `learning_objective`, `is_active` maps to active/archived. `contract_version=1` identifies canonical snapshots and guards their content. |
| Profile | Existing `candidate_profiles` plus version, status, revision and owned `file_asset_id`. Confirmation and edits require expected revision. Child evidence edits lock the parent and increment its revision. |
| Skills and aliases | Existing `skills` plus **one** `skill_names` namespace for canonical names and aliases. Whitespace/case normalization and uniqueness prevent alias shadowing. Ambiguous legacy spellings abort migration for explicit resolution. |
| Candidate evidence | Existing `candidate_skill_evidence`; `evidence_type` maps to source kind. Multiple records are allowed. Intake cannot write demonstrated/assessment evidence; DB-03 adds verified assessment lineage. |
| Journey | New `journeys` binds the same owner's goal and profile. Draft profile revisions follow edits; confirmation freezes the profile and advances the journey. Only the initial three states are included; AF-01 extends state transitions. |
| Assets | New `assets` stores private-user metadata with an owner-scoped object key. Composite FK prevents linking another user's file. DB-02/DB-03 add template/attempt assets. Upload cleanup and signed URL handlers are integration work. |
| Job snapshots | New append-only `job_snapshots`; the existing mutable `job_postings` remains legacy. Stable provider/job/time/content hash identifies a retrieval. |
| Search and membership | New `job_searches` and `job_search_snapshots`. The membership's `data_origin` labels cached reuse while snapshot provider/time/hash remain unchanged. Cache reuse checks matching filters and a seven-day age bound. |
| Job requirements | Extend existing `job_skill_requirements` with snapshot FK; each record has exactly one legacy or canonical source. Source excerpts must occur in the immutable description. |
| Gap analysis | Extend existing `gap_analyses` with owner, journey, search and profile-revision references. JSON arrays validate against the contract. Source links must match the selected search, canonical skill and exact requirement. |

No workflow queue, template registry, grading tables or export system is introduced in this wave. `normalized_filters_json` is an internal AF-03 input: it must be derived from the stored goal, never accepted as arbitrary browser filters.

## Migration and legacy policy

Run on a disposable database first. The environment variable below must point to the intended PostgreSQL/Supabase database; migration requires its administrative DB connection, not an HTTP API key.

```sh
python -m pip install -r requirements-wave1.txt
python -m database.migrate
```

The command reads `DATABASE_URL`. On a clean install it applies the reviewed `database/schema.sql` baseline before versioned migrations. Supabase supplies the storage schema and backend role; test fixtures provide minimal stand-ins on plain PostgreSQL. A successful migration preserves legacy data with version 0; it does not copy old model-reviewed evidence into v0.1 results. Existing unscoped legacy write APIs are not compatible v0.1 writers. In particular, the old one-evidence-per-skill upsert is superseded by explicit source records.

Do not run the `agentic-fw` database initializer against this database. Its conflicting identity layout is rejected. Export/back up that prototype separately and re-intake profiles under verified identities; preserve old assessments as historical nonconforming records. Linking a legacy account requires a separately reviewed ownership-verification process, not matching an email. There is no automatic destructive reset or lossy down migration.

Use `psycopg.rows.dict_row` with repository functions, and place each complete write operation in `with conn.transaction():`. Catch errors outside that block so partial searches/sources roll back. Every actor ID is resolved from a **verified JWT** through `user_for_subject`; it must never come from a client-provided user ID. Returned dicts are storage records; AF-01 maps them to public DTOs without leaking object keys or internal version flags. Public/anonymous database access remains blocked by RLS.

## Provider setup and use

Start with **one model per provider**, with Nebius active in the example config. Only the active route is used unless a task override or explicitly approved fallback applies. Model IDs and keys are environment variables; no models or keys are hardcoded. Automatic fallback remains off.

Copy `contracts/v0.1/model-routing.example.yaml` to `deployment/model-routing.yaml`. Set `NEBIUS_MODEL`, `NEBIUS_API_KEY`, `OPENAI_MODEL` and `OPENAI_API_KEY` locally for the routes you will test. The gateway does not search for keys or load unrelated `.env` files. An unused route does not need credentials.

```sh
python -m scripts.check_model_capabilities \
  --routing deployment/model-routing.yaml \
  --suite deployment/model-fixtures.example.json \
  --profile nebius --output deployment/nebius-capabilities.json
# Repeat with --profile openai --output deployment/openai-capabilities.json.
```

These probes make billable calls only when explicitly run with credentials. They test actual text/schema/fixture outcomes and an input-budget request; refusal, truncation, timeout and source-rejection handling use injected responses in the adapter tests. Reports describe this tested envelope, not the provider's maximum context size. Replace the illustrative suite with the actual task prompts/schemas and representative normal, missing-evidence and adversarial cases before a product deployment. Prompt/schema/fixture changes change its hash and invalidate old reports.

At enqueue time, persist the output of `pin_routing(config)` with the workflow. It includes exact resolved models and a revision hash, but only environment variable **names** for credentials. Construct `ModelGateway(pinned_snapshot, fixture_suite, record_invocation)` from that saved snapshot on resume. Pass the same routing, prompt and output-schema versions in `ExecutionContext` along with an aware UTC deadline. The server supplies fallback consent separately; config permission alone cannot authorize sending user data to another provider.

`generate_json(task, schema_id, validated_input, context, validate_business=...)` returns validated data and its invocation ID. `generate_text(...)` returns text and its invocation ID. A business validator must return `True` only for source-supported, domain-valid results; neither valid JSON nor the model's own assertion is enough. No grading, publication or approval task exists in the allowed task set.

`record_invocation` is a required durable sink: store each schema-valid event before returning success; sink failures abort the call. It must commit separately from a failed domain transaction so failed attempts remain visible. AF-01/DB-03 wire this into workflow persistence. Close the gateway/client when its owning worker shuts down. Transport attempts, including a possible schema repair, share the configured maximum of three requests and one deadline. Only transient failures can trigger retries/fallback; repairs are at most one and stay on the current route.

Official API references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Nebius compatible transport](https://dev.nebius.com/cookbook/first-agent-on-nebius), and [Nebius token-limit spelling](https://dev.nebius.com/cookbook/beam-reflection-token-factory). The adapter confines provider-specific token fields to its request builder.

## Verification and remaining integration

```sh
python -m pip install -r requirements-test.txt
# Point only at a disposable PostgreSQL test server; tests create/drop cb_test_* databases.
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres python -m pytest tests -q
ruff check careerbridge database/intake.py database/migrate.py scripts tests
ruff format --check careerbridge database/intake.py database/migrate.py scripts tests
python contracts/v0.1/validate_contract.py
```

The database tests cover clean installation, reapplication, legacy upgrade, ambiguous aliases, schema-conflict refusal, concurrent confirmation, ownership/RLS, immutable snapshots, source validation and cache provenance. Provider tests cover both routes, text/JSON modes, capability failures, pinned configuration, redacted provenance, bounded repair/retry, deadline handling and explicit fallback consent.

**Not yet verified:** live OpenAI/Nebius model quality/capabilities (model IDs and credentials are not configured), hosted Supabase/Auth/Storage integration, or a browser/API journey. No live capability report is included. The unmerged agent prototype's direct client constructors are not imported into this branch; replacing those call sites happens as AF-01/AF-03 integrate the modules. This wave provides the gateway they must use. DB-01 and AF-02 remain open until review and their remaining integration/live acceptance evidence are complete.
