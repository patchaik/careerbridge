# CareerBridge Shared Implementation Contract
Version 0.1.0 | Proposed baseline | 14 November 2026

## Purpose and authority

This package defines the contracts for parallel UI, agent-framework and DB work.
It is a specification and validation package, not an implemented backend or an
applied migration. No GitHub branch or live database has been changed.

Scope agreed with the product owner: any target role and evidence-backed gap
analysis; learning and assessment for a small set of reviewed competency
templates. There is no required RAG competency, model provider or RAG grader.
OpenAI and Nebius are interchangeable behind the internal model gateway.

Normative files:
  openapi.yaml / openapi.json           Same public API, alternative formats
  data-model.yaml                      Relational model and transaction rules
  schemas/competency-template.schema.json
  schemas/private-grading-bundle.schema.json
  schemas/model-routing.schema.json
  schemas/model-invocation.schema.json
  schemas/model-capability-report.schema.json
  model-routing.example.yaml           Deployment example; not live config
  validate_contract.py                  Offline contract checks
  acceptance.csv                       Implementation conformance checklist

The example templates and private test bundle are DRAFT FORMAT FIXTURES, not
human-reviewed curricula, production tests or evidence of learner competency.
Their small question counts and thresholds demonstrate the format only. They
cannot be published until a reviewer completes the publication gate below.

## 1. Shared Http Conventions

Base path: /api/v1. JSON fields: snake_case everywhere, including generated UI
types. UUID identifiers. ISO-8601 UTC timestamps, emitted with Z. Fractions are
0..1, never percentages. All input objects reject unknown fields. Null means
explicitly unavailable; request properties are required unless the schema says
otherwise. Empty lists are valid only where the schema permits them.

Identity: Supabase Auth bearer JWT, validated for signature, issuer, audience
and expiry. The backend derives user_id from sub. The browser never supplies
ownership, scores, provider credentials or approval-role claims. X-User-Id and
email-as-login are removed. Sign-in, signup and password reset use the identity
provider SDK; /me reads the application identity. No duplicate custom password
service is introduced. A valid identity with no application row is provisioned
idempotently on first /me. Model-backed operations require recorded processing
consent. Template-admin routes require a server-verified template_reviewer role.

All application tables are private by default. A service-role DB credential
bypasses RLS, so every repository operation must still scope ownership. Cross-user
IDs return 404 without disclosing existence. Authentication failure is 401;
missing reviewer role is 403. Published template metadata is readable by signed-in
learners; draft versions and private grading material are not.

All mutations require Idempotency-Key, a UUID. Scope is (user_id, method, canonical
route, key). A request fingerprint includes the canonical JSON or uploaded byte
hash. An identical retry returns the original status/body, including the same
workflow/attempt/export ID. A different fingerprint returns 409
idempotency_conflict. Reserve key + mutation/enqueue in one transaction. Keys are
retained for 7 days; terminal assessment and export uniqueness also prevent
duplicates after that window. A repeated submit on a terminal attempt returns
the same result only when its submission hash matches, otherwise 409.

Expected revisions and content hashes guard mutable profiles, paths and resumes.
Stale revisions return 409 revision_conflict and do not partially write. A failed
business operation returns the common Error shape. Schema errors use 422,
unsupported or oversized upload uses 400/413, throttling uses 429, and retryable
provider unavailability uses 503. Error messages and request IDs contain no raw
resume text, tokens, model prompts or private grading keys. CORS is an explicit
deployment allowlist (including the current UI dev origin), not a wildcard.

Lists use stable cursor pagination (created_at, id), default 20, maximum 100.
Top-ten skill lists and resource category caps are product caps, not pagination
limits. Signed download URLs expire after 10 minutes. A new authenticated GET
can issue a fresh link for an existing export; it never regenerates the document.

## 2. Asynchronous Operations And Resumability

Slow mutations ALWAYS return 202 Accepted, never a sometimes-inline alternate
shape. Accepted contains workflow_id, status=queued, poll_url. Poll the relative
URL against the same API origin; Retry-After defaults to one second. A network
error does not mean failure: UI retries polling with bounded backoff and offers
resume. It must not enqueue a duplicate operation to recover status.

Workflow status: queued -> running -> completed | failed. Completed has exactly
one typed result reference and error=null. Failed has result=null and a safe
error. Queued/running have both null. The result reference resolves through:
  profile -> GET /profiles/{id}
  job_search -> GET /job-searches/{id}
  gap_analysis -> GET /gap-analyses/{id}
  learning_path -> GET /paths/{id}
  lesson -> GET /lessons/{id}
  tutor_message -> GET /tutor/messages/{id}
  practice_run -> GET /practice-runs/{id}
  assessment_attempt -> GET /assessment-attempts/{id}
  resume -> GET /resumes/{id}
  resume_export -> GET /resume-exports/{id}
  data_export -> GET /data-exports/{id}
  deletion -> GET /deletions/{id}

Workflow is an operation record. Journey is the product checkpoint. Do not use
conversation history or localStorage as either source of truth. GET /journeys
lets the UI resume after refresh/sign-in. Browser caches must be scoped by user
and cleared on logout. Operation failures leave the last valid checkpoint intact.
Worker recovery uses leases and transactionally committed results; exactly-once
external inference is not promised, but duplicate product effects are prohibited.

Journey transitions are listed in data-model.yaml. State changes are server-owned.
New confirmed profile or career goal means a new journey/analysis; old snapshots
remain reproducible. MVP handles one selected competency/path per journey. More
gaps can be pursued through additional journeys. No silent replacement of a
selected path, rubric, profile revision or goal is allowed.

## 3. Intake And Market Evidence

POST /profiles creates a manual draft. POST /profiles/resume creates a parsing
workflow and draft profile. The UI fetches the profile when parsing completes.
PUT /profiles/{id}/confirm submits keep/remove decisions by skill ID plus new
self-reported skills. The server retains extraction evidence for kept items;
it does not accept client-authored resume excerpts or demonstrated status. Full
skills list means omission of an existing skill is a validation error: every
existing skill needs one keep/remove decision. A duplicate decision is rejected.
The profile also returns extracted experience for review. Confirmation supplies
the complete corrected experience list. Client source_excerpt is never trusted:
the server retains it only for an unchanged extracted entry with matching source;
edited/new background is recorded as user-confirmed with no fabricated excerpt.
Manual entry may include experience or leave it empty. Validate month order and
ownership/uniqueness of entry IDs; arbitrary IDs cannot reference other profiles.
Confirmed profiles are immutable in v1; further changes create a new draft and
new journey. This avoids invalidating historical market and assessment evidence.

Goals are immutable snapshots in v1. Create a new goal for changed filters.
Create a journey from a goal and owned profile. PROFILE_REVIEW remains until the
profile is confirmed. No job search before confirmation and consent.

Job provider is an open identifier such as adzuna, greenhouse or keenable.
data_origin is separate: live, cached, synthetic. A cached record keeps the
original provider and retrieval timestamp; it is not relabeled as freshly fetched.
Search requests use stored goal filters. Max default 10 eligible jobs; max 20.
Exclude unsupported requirements from incomplete descriptions. Preserve excerpts,
source URL, provider ID, completeness and retrieval time in immutable snapshots.

Use cached data on provider outage only when it matches normalized role/geography/
seniority filters and is <=7 days old (initial configurable policy). Otherwise an
explicit demo-mode fixture may be shown as synthetic, or return unavailable.
Never fill a zero-result live search with invented jobs. Snapshot provenance is
carried into gap analysis and visible in UI, including mixed live/cached results.

Normalize aliases through skills. Gap ranking is deterministic after validated
extraction: required-job coverage descending, total job coverage descending,
then canonical skill name. Count each skill once per job; denominator is the
eligible snapshot count. Existing demonstrated evidence, confirmed evidence and
self-report are distinct. No resume keyword does not imply lack of competence.
Credential/experience barriers are labeled rather than mapped to a short course.
Every gap source must reference a requirement for that normalized skill within
the selected job-search snapshot. Excerpt must equal stored requirement evidence.

## 4. Reviewed Competency Template Format

A TemplateDefinition contains:
  stable template_key + immutable version
  competency skill ID, level, objective and limited evidence scope
  prerequisite skill IDs and a concept DAG
  milestones referencing concepts and registered practice activities
  text/hands-on modalities, resource IDs
  rubric criteria, knowledge/project thresholds and critical checks
  diagnostic policy, remediation cap and allowed claim scope

No provider ID, model ID, runnable source code, grader implementation, answer key
or private assessment cases belong in this public definition. Agent-generated
learning plans may tailor pacing, explanations and practice examples; they may
not alter objective scope, final criteria, thresholds or test keys. New activities
require a registered server handler and UI renderer; a template alone cannot
invent an executable workbench.

Version lifecycle: draft -> in_review -> published -> retired. Draft edits create
another immutable submission/version in this initial contract (no admin PATCH).
A review request establishes in_review; rejection leaves it in_review for history
and the author submits a new version. A server-authorized reviewer records the
exact public definition hash and private grading-bundle hash. Approval requires
all review checks true. Publication requires a matching approving review,
registered activity/grader versions, verified nonempty resource coverage, valid
references and passing known pass/fail/ungradable grader fixtures. A reviewer may
not approve their own draft. No example in this package supplies a fake approval.

Hashing: SHA-256 of RFC 8785 canonical JSON, excluding envelope metadata. Use the
same canonicalization on server and review tooling; do not hash arbitrary pretty
printing or JavaScript object insertion order. Publication freezes the public
definition, rubric and private test bundle. Changing an existing test requires a
new version and review; separately reviewed equivalent alternate sets may be
registered under the frozen rubric as described below. Retired templates cannot start new paths; existing pinned
attempts remain reproducible unless an explicit incident invalidation policy
blocks them. That policy must not silently rewrite historical grades.

Separate GradingBundle contains the fixed knowledge questions, final tasks,
private expected results, test weights and private asset references. It is only
available to reviewers and the deterministic grading service. The learner API
assembles a sanitized attempt with prompts/options/tasks but no correct answers,
expected outputs or private grader metadata. Do not pass this bundle to the
tutor, narrative-feedback model or any external model provider.

Initial activity/renderer/grader registry:
  table_transform_v1 -> table_result_v1
    Approved ordered operations: filter_equals(column,value),
    group_sum(column,group_by), sort_ascending(column).
    For filter_equals group_by=null; value is a scalar. For group_sum and sort,
    value=null. For sort group_by=null. Unknown columns/invalid types fail.
    Aggregate numeric values only; null numeric input is invalid, not silently 0.
    Dataset <=1000 rows, <=20 columns; <=10 steps; <=2 seconds execution.
    Server computes the output; learner-supplied output or scores are ignored.
    Compare canonical rows sorted by expected.sort_by, numeric tolerance per
    reviewed case, exact strings/booleans/nulls, identical column set and row count.
  evidence_selection_v1 -> evidence_match_v1
    Task assets contain questions and selectable fictional evidence records.
    Expected IDs must belong to the assigned task. Compare selected IDs as sets;
    duplicates are invalid. insufficient_evidence=true requires an empty selection.
    Match each question's selection and insufficiency flag to reviewed expectation.
  knowledge choice -> answer_key_v1
    Question/option IDs must be unique and present in the assigned attempt.
    Exact option ID equality determines the score; no browser scoring authority.

These two activity families are proposed initial extension points, not claims to
validate every skill. Future activity kinds need a versioned registry extension,
schemas, UI renderer, bounded executor and verified grader before publication.
No arbitrary Python/SQL/script submission or unrestricted URL fetching is allowed.

5. LEARNING, DIAGNOSTICS AND ASSESSMENT

A supported gap may map to a published template only if normalized skill/scope,
prerequisites and required handlers match. Unsupported gaps remain visible with
no_published_template or prerequisites_unmet; path generation returns 409
template_unavailable. Never substitute a trendy skill or silently use RAG.

Generate a path from journey, analysis, selected gap and template version. Store
an immutable rubric binding and server-only test-set binding. Learner approval
acknowledges the exact path revision/rubric hash; it is not template publication.
Published rubrics are already frozen. Reject lesson/practice/final-assessment
requests before path approval. Resume a paused path only on explicit user intent.

Resources: reviewed catalog first; live supplements must be validated for link,
access terms, concept coverage and learner level. Limit five free and five paid;
mixed/unknown are separately labeled. Timestamp and ranking reason are returned.
No quota padding. Resource content is linked, not copied without permission.

Diagnostic is optional. It uses separate diagnostic tasks with no overlap with
practice or final test assets and returns placement feedback only. It never
creates verified_skill_evidence, consumes a final-assessment retry or completes a
competency. A learner who appears skilled can proceed directly to independent
assessment. In v0.1 the supplied GradingBundle is FINAL ONLY; a diagnostic bundle
uses the same schema but must be separately registered with purpose=diagnostic.

Final attempt: one active attempt per path/purpose. Server assigns and stores the
fixed rubric, test-set version and grader build at start. Submission names the
same rubric ID and hash; mismatch is 409. All assigned question/task IDs must
appear exactly once. Extra/missing IDs are 422. Successful submission locks the
payload; it cannot be edited while grading. Public practice records never become
final assessment artifacts. No tutor hints while a final attempt is active; reject
tutor/practice calls for that path until the attempt is terminal.

Outcome algorithm (server only):
  - Each reviewed test has positive weight and one deterministic result.
  - Any required result ungradable -> needs_review, no evidence, no retry consumed.
  - Component fraction = passed-test weight / total component weight.
  - A criterion passes only if all tests linked to it pass.
  - Pass requires both component thresholds AND every critical criterion passing.
  - Otherwise failed; persist failed criteria and targeted remediation suggestions.
  - Diagnostic pass remains placement-only regardless of score.
  - Final pass writes attempt result + artifacts + verified evidence + checkpoint
    in one transaction. An LLM narrative cannot change the outcome.

Three unsuccessful final attempts per path is the initial cap. On failed attempts
one and two, return REMEDIATION; on the third, return NEEDS_REVIEW and block a new
automatic final attempt. needs_review caused by grader failure does not count as
learner failure. All failed_criterion_ids and criterion-result IDs reference the
frozen rubric. A completed path cannot be repeatedly submitted for duplicate proof.

Final feedback explains missed criteria without publishing reusable answer keys.
Repeat attempts must use a reviewed alternate test set with no prior question/
asset overlap. If none is available, return assessment_ungradable/needs_review and
offer human assistance rather than reuse a disclosed test. Alternate sets must
have the same rubric, thresholds, coverage and grader build, and be reviewed and
bound before attempt start. Both final and diagnostic set registrations are
specified in data-model.yaml; the authoring API initially supplies one final set.

## 6. Resume Approval And Export

The service builds a base resume from confirmed background and adds only selected
verified evidence owned by the same user. Each changed bullet cites confirmed
profile records and/or verified_skill_evidence. Only independently assessed
platform achievements may be added as new project/practical-training claims.
No new employer, certification, years of experience or production ownership may
be inferred from an assessment. Validate references and semantic claim scope;
user approval alone does not turn an unsupported claim into supported evidence.

PATCH includes expected_revision and complete replacement changes; server validates
all support, increments revision, recomputes hash and clears approval. Even edits
to an approved resume return it to draft. Export requires exact approved revision
and hash, not an approval boolean from the browser. Approval records actor/time/
hash/revision. PDF and DOCX are separate export records of the SAME approved
content; each format can be exported without consuming the other's status.

Export stores private bytes only after render validation, then records file hash
and content hash. Return a signed URL. Repeated export for (resume,revision,format)
returns the existing artifact. Storage upload + DB registration uses an outbox or
staging protocol; failed registration removes orphan bytes. Editing a resume never
changes a historical exported artifact; old export versions remain labeled.

## 7. Openai / Nebius Provider Contract

Deployment config is server-only. active_profile selects openai or nebius;
task_overrides optionally select a provider per bounded generation task. Environment
variables supply exact accessible model IDs and API keys. No model choice is
hardcoded or inferred from a provider name. The example defaults to Nebius but is
not deployable until credentials, model IDs and capability reports are supplied.

Internal adapter interface:
  generate_json(task, schema_id, validated_input, execution_context)
      -> {validated_data, invocation_id}
  generate_text(task, validated_input, execution_context)
      -> {text, invocation_id}

execution_context contains workflow_id, user_id, pinned routing revision, prompt
version, output-schema version and deadline. The orchestrator supplies trusted
instructions and labels external source text as data. Both adapters use a common
Chat Completions transport for this baseline. An OpenAI Responses adapter can be
added later without changing domain schemas. SDK/framework specifics stay in the
adapter; agents must not construct ChatOpenAI or provider clients directly.

Capability gate per exact (provider, base_url, model, adapter_version): text,
structured mode, allowed schema subset, token limits, refusal/truncation behavior,
timeout handling and task quality checks. Do not treat OpenAI-wire compatibility
as equal model capability. A report must match the selected model and adapter;
missing, expired or failed report blocks deployment for that route. All required
checks must be true, the fixture suite must match the current task contracts, and
the configured token budgets must fit measured limits. Capability reports are
generated by real conformance probes and are NOT supplied by this package.

Prefer native JSON Schema output when tested for the selected model. Provider
schema limitations are handled by a simplified generation schema plus strict local
domain validation. json_object_validated is an explicit tested alternative, never
a silent downgrade. At most one schema repair; still-invalid output becomes
invalid_model_output, with no domain write. Refusal, truncation and transport
failure are distinct outcomes. Valid JSON alone never proves source accuracy.

Retry transient transport failures only (429/timeout/5xx), within the shared
deadline, honoring Retry-After and using jitter; maximum three transport attempts.
Do not retry invalid credentials, refusals, unsupported capabilities or forbidden
actions through a different provider. Cross-provider fallback is disabled by
default. If explicitly enabled in deployment config, it is restricted to approved
profiles whose data-processing consent/policy and capability reports cover the
task. Persist each attempted provider and actual returned model. No browser setting
or prompt can change fallback policy.

Pin routing revision when a workflow is enqueued. Changing active_profile affects
new workflows only. Retries use the pinned profile unless explicit configured
fallback applies. Cross-provider outputs need equivalent schema/business outcomes,
not identical prose. Record ModelInvocation metadata: provider, requested/returned
model, task, prompt/schema/routing versions, latency, tokens when available and
provider request ID. Do not log prompts, resume text, secrets or private tests.

Models may extract, explain, plan within approved boundaries, tutor and suggest
resume wording. Neither provider may publish a template, approve an export,
write verified mastery, change a frozen rubric or grade deterministic checks.
The grader has no LLM dependency. No model-specific columns are added to skill,
template, rubric or evidence payloads; invocation records hold provenance.

Verified reference basis (14 November 2026):
  https://dev.nebius.com/cookbook/first-agent-on-nebius
    Official Nebius example uses OpenAI SDK Chat Completions and the endpoint
    https://api.tokenfactory.nebius.com/v1/ .
  https://developers.openai.com/api/docs/guides/structured-outputs
    Structured generation has model/schema constraints; handle refusal,
    incomplete output and application validation explicitly.
No live calls, provider availability tests or model quality claims are made here.

## 8. Ownership And Parallel Handoff

UI owner:
  Generate types/client from OpenAPI; use snake_case at the wire boundary.
  Replace mock-only routes and camelCase assumptions. Build template-driven views
  and registered activity renderers. Poll typed result references. Never infer
  mastery from practice completion. Keep provider config out of user flows.

Agent-framework owner:
  Implement API/identity/workflow services, provider gateway and source validation.
  Replace direct ChatOpenAI creation with the gateway. Use shared repositories,
  never independent CREATE TABLE calls. Implement template resolver, bounded
  activities and deterministic graders. Mock generation behind the same adapter
  in tests; synthetic grading must never write production verified evidence.

DB owner:
  Implement versioned migrations and repositories from data-model.yaml. Preserve
  reviewed-version references and ownership in every transaction. Implement
  idempotency, outbox/file cleanup, frozen-row guards and evidence invariants.

Integration owner (shared):
  Generate/validate schemas in CI; maintain publication tests; run acceptance.csv.
  Breaking schema changes require contract revision before either implementation
  ships. Freeze v0.1 once all three owners have reviewed this concrete package.
  This review is a team handoff, not an automatic permission gate on further work.

## 9. Migration From The Reviewed Branches

main / patchai-db-layer:
  Keep domain repositories, private storage and integrity concepts. Replace
  caller-supplied user IDs with authenticated identity. Add versioned templates,
  path-rubric-test bindings, assessment artifacts, snapshot semantics and exports
  per format/revision. Do not call the existing mutable job upsert a historical
  snapshot. Existing schema.sql is not a migration framework.

agentic-fw:
  Replace careerbridge.db with the shared repository interfaces. Its learning_paths
  and assessment_attempts tables conflict with main; do not point both initializers
  at the same schema. Convert workflows into operation records plus journeys.
  Replace generated written-project pass decisions with reviewed activity graders.
  Old model-reviewed evidence must remain labeled legacy/nonconforming; do not
  upgrade it to verified v0.1 evidence without re-assessment.

ui-design:
  Replace /auth/* with the identity SDK, /onboarding/parse with /api/v1/profiles/resume,
  /paths/generate with /api/v1/paths, /arena/* with lesson/tutor/practice endpoints,
  and /assessments/submit with attempt-specific submission. Resume operations now
  explicitly create drafts, mutate revisions, approve and export. queued/completed
  replace pending/complete. No implicit snake_case/camelCase cast.

Snapshot basis: main 12882f0; ui-design df92d695; agentic-fw 5f990e5;
patchai-db-layer b190fba (same file tree as reviewed main).

## 10. Validation And Known Limits

Run: python validate_contract.py
Dependencies: PyYAML and jsonschema (Draft 2020-12 support).
Checks include local references, operation IDs/path parameters/auth/async shapes,
schema meta-validation, positive fixtures, invalid-score/key/code payload rejection,
template graph/reference rules and private/public separation checks.

These are contract checks, not live API, provider, database, browser or grader
execution tests. No generated clients or production migration are claimed. The
two example definitions demonstrate reusable formatting; only the tabular example
has a miniature private bundle, and neither is publication-ready. Real resource
records, reviewer identity, richer test cases, diagnostic/alternate final sets and
deployment model IDs are implementation inputs with explicit publication/preflight
gates. Register diagnostic/alternate bundles with POST /admin/templates/{id}/test-sets
and approve with POST /admin/test-sets/{id}/review. Reviewer-only GET/list routes
provide the private material needed for review. Approvals require a different
reviewer from the author, a matching bundle hash and successful fixture/separation
checks. Publication requires at least an approved diagnostic set and final set;
automatic retries require additional reviewed unused final sets. Additional sets
for a published version may be registered and reviewed only if they preserve its
frozen rubric, coverage and grader build; their immutable set IDs are bound at
attempt creation. P1 wellbeing chat and advanced reviewer UI are outside this P0 API surface;
preferences exist so opt-in never defaults to true.

## 11. Minimal MVP implementation

Follow [implementation guidelines](../../docs/IMPLEMENTATION_GUIDELINES.md).
This contract specifies observable behavior and data invariants, not a service,
class or physical table per logical concept. Reuse one API, one database-backed
worker and the existing database package. Document any logical-to-physical mapping
in the affected migration PR and preserve IDs, ownership, frozen versions,
uniqueness and transaction guarantees. A shared provider transport, small
conformance script and file-based template authoring are sufficient. Existing
endpoint shapes, lease/recovery rules and release gates remain unchanged.
