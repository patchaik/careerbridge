# CareerBridge implementation handoff

## Scope and source of truth

Implement [MVP_REQUIREMENTS.md](MVP_REQUIREMENTS.md) against [contracts/v0.1](../contracts/v0.1/README.md). OpenAPI defines wire shapes; the normative contract defines cross-record invariants; data-model.yaml defines the logical storage target. The old api/openapi.yaml and docs/DB_DESIGN.md describe the previous baseline and are not competing v0.1 contracts.

General target roles and sourced gaps are supported. Only published reviewed templates offer verified learning/assessment. RAG is optional. OpenAI and Nebius are server-selectable providers; deterministic mastery remains independent of them.

## Parallel work rules

1. Review/adopt this contract PR before merging implementations that depend on it. During review, branch from the PR head or copy the exact contract revision into isolated implementation branches.
2. UI starts reusable clients and screens against schema-valid fixtures. Agent work starts adapters, executors and service interfaces. DB work starts migrations and repositories. Live integration acceptance follows the dependencies below.
3. **Blocked by means an integration/acceptance dependency, not a prohibition on starting code against the contract.** Each issue says what can start immediately.
4. A change to request/response fields, enum values, template/grader semantics or evidence lineage must update the contract and tests before downstream implementations consume it.
5. Mock fixtures remain clearly labeled. No mock assessment or draft example template can create production verified evidence.
6. Each implementation PR links its issue, check IDs and validation results. Do not close an issue on mock-only UI completion when its acceptance requires live integration.

## Branch integration

- `main` already contains `patchai-db-layer`; do not merge that work again.
- `ui-design` contributes React screens; adapt its client/types and replace placeholders.
- `agentic-fw` contributes FastAPI/worker/agent prototypes; replace its private persistence implementation and direct provider construction.
- Use short-lived branches from the adopted baseline rather than blindly merging both schema initializers. Preserve existing work and migrate deliberately.

## Workstream deliverables

| Workstream | Owns | Must not own |
| --- | --- | --- |
| UI | Generated API types, accessible journey, activity renderers, polling, exact approval payloads | Provider secrets, scoring rules, ownership assertions, fake passing results |
| Agent framework | Auth/API, orchestration, model gateway, source validation, template resolver, bounded executors, graders, document generation | Independent DDL, silent rubric changes, fabricated market/skill evidence |
| DB | Migrations, repositories, ownership, immutable versions, idempotency, transactional evidence/approval/export | Unverified promotions, public test keys, conflicting table definitions |
| Integration | Full acceptance and real provider/browser/DB checks | Treating schema validation as proof of runtime correctness |

No individual assignees are inferred. Teams can assign the linked issues without changing their acceptance contracts.

## Dependencies and issue index

Dependencies are recorded as clickable issue references and task lists, not native GitHub blocked-by relationships. Codes remain stable even if titles change.

| Code | Issue | Workstream | Priority | Integration blocked by |
| --- | --- | --- | --- | --- |
| DB-01 | DB-01 | DB | P0 | None |
| DB-02 | DB-02 | DB | P0 | DB-01 |
| DB-03 | DB-03 | DB | P0 | DB-01, DB-02 |
| DB-04 | DB-04 | DB | P0 | DB-01, DB-03 |
| AF-01 | AF-01 | Agent | P0 | DB-01 |
| AF-02 | AF-02 | Agent | P0 | None |
| AF-03 | AF-03 | Agent | P0 | AF-01, AF-02, DB-01 |
| AF-04 | AF-04 | Agent | P0 | AF-01, AF-02, DB-02, AF-03 |
| AF-05 | AF-05 | Agent | P0 | AF-01, AF-02, AF-04, DB-03 |
| AF-06 | AF-06 | Agent | P0 | AF-01, AF-02, AF-05, DB-04 |
| UI-01 | UI-01 | UI | P0 | AF-01 |
| UI-02 | UI-02 | UI | P0 | UI-01, AF-03 |
| UI-03 | UI-03 | UI | P0 | UI-01, AF-04 |
| UI-04 | UI-04 | UI | P0 | UI-01, UI-03, AF-05 |
| UI-05 | UI-05 | UI | P0 | UI-01, AF-06 |
| QA-01 | QA-01 | Integration | P0 | DB-01, DB-02, DB-03, DB-04, AF-01, AF-02, AF-03, AF-04, AF-05, AF-06, UI-01, UI-02, UI-03, UI-04, UI-05 |
| P1-01 | P1-01 | Cross-stream | P1 | QA-01 |

## Suggested integration waves

- **Wave 1:** DB-01 and AF-02; AF-01 and UI-01 scaffold against the same contract.
- **Wave 2:** DB-02/DB-03 and AF-03; UI-02 connects onboarding and market evidence.
- **Wave 3:** AF-04 and UI-03; complete real template reviews/resources. DB-04 prepares approval/export storage.
- **Wave 4:** AF-05 and UI-04; prove independent grading and atomic evidence updates.
- **Wave 5:** AF-06 and UI-05; complete approved PDF/DOCX export.
- **Wave 6:** QA-01 closes the release gates. P1-01 follows.

These are dependency waves, not delivery-date estimates. Provider credentials/model access and real reviewer/content work can proceed alongside implementation.

## Acceptance and validation

Use [acceptance.csv](../contracts/v0.1/acceptance.csv) as the release checklist. Requirements include two reviewed competencies with one non-RAG, honest unsupported coverage, real provider evidence/fallbacks, deterministic pass/fail/ungradable cases, protected frozen keys, idempotency/recovery, truthful approved exports, privacy/isolation and keyboard completion.

```sh
python -m pip install -r contracts/v0.1/requirements-validation.txt
python contracts/v0.1/validate_contract.py
```

The checked package passes offline schema/reference and semantic/negative fixture checks. No live model/API/database/browser tests or production migration were performed while preparing this handoff. Implementations must supply the runtime evidence required by their issues.

## First decisions already fixed

Use `/api/v1`, snake_case, JWT-derived identity, typed async workflows, reviewed competency definitions with private test bundles, and explicit résumé revision/hash approval. OpenAI/Nebius routing is server-side; automatic cross-provider fallback is off unless explicitly configured and tested. Model IDs and credentials are deployment inputs, not frontend fields.

Real competency packages require human review, working resources, diagnostic and final test sets, approved alternate tests for retries and registered graders. The included examples are format fixtures only. Real held-out keys/assets must stay outside this public repository.
