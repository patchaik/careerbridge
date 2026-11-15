# CareerBridge MVP requirements

Status: proposed shared implementation baseline v0.1.0. Product scope was agreed in the design review; detailed engineering policies below are proposed for adoption with this PR.

## Product scope

CareerBridge helps a learner choose a target role, compare confirmed experience with sourced job requirements, select a relevant competency, learn and practice, demonstrate it independently, and approve a truthful résumé update.

The platform accepts **any target role**. Learning plans use saved resources, a **skill-specific learning goal** and the learner’s chosen modality. Reviewed templates are **not required for learning**. Independent assessments remain a separate future feature requiring reviewed criteria; accepting a plan never certifies a skill. There is no RAG dependency.

OpenAI and Nebius are interchangeable server-side model providers. Provider choice must not alter public APIs, competency identity, rubric criteria, deterministic grading or résumé approval rules.

## Functional requirements

| ID | Priority | Requirement | Observable acceptance |
| --- | --- | --- | --- |
| FR-01 | P0 | PDF/DOCX or manual intake | Readable uploads produce a draft; unreadable files offer manual entry without invented content. |
| FR-02 | P0 | Goal and preferences | Store role, location, seniority, learning objective and modality as a goal snapshot. |
| FR-03 | P0 | Evidence-backed extraction | Technical/interpersonal/domain skills retain genuine source excerpts; aliases normalize to stable skills. |
| FR-04 | P0 | Profile review | Learner corrects skills and experience before confirmation; analysis cannot bypass confirmation. |
| FR-05 | P0 | Current job evidence | Real provider results retain URL, provider ID, retrieval timestamp and completeness; fallback is clearly labeled. |
| FR-06 | P0 | Skill Bridge | Return up to ten existing, market and ranked gap skills; every market gap cites matching requirements in selected snapshots. |
| FR-07 | P0 | Honest evidence states | Required/preferred/unspecified and self-reported/confirmed/demonstrated/not-established are distinct; omission is not inability. |
| FR-08 | P0 | Optional diagnostic | Learner can skip it or receive placement feedback; diagnostic alone never writes verified mastery. |
| FR-09 | P0 | Competency pathway | Selected gap + explicit skill goal + chosen modality + selected saved resources produce a concrete learning outcome and ordered milestones; no template required. |
| FR-10 | P0 | Resource discovery | Discover and save free and paid resources with coverage/access evidence and checked times; mixed/unknown labeled, no quota padding. |
| FR-11 | P0 | Learn and practice | Text, hands-on or both plans respect modality and provide observable self-checks; practical activities happen outside the app; acceptance and progress do not award mastery. |
| FR-12 | P0 | Reviewed frozen rubric | Publication requires reviewer evidence; attempts pin immutable template, rubric, test-set and grader versions. |
| FR-13 | P0 | Independent assessment | Knowledge and practical work use unseen tasks; deterministic critical checks cannot be overridden by model narrative or browser scores. |
| FR-14 | P0 | Verified skill evidence | Only a passing final attempt atomically creates evidence with reproducible artifacts and limited scope. |
| FR-15 | P0 | Résumé closure | Supported before/after diff, explicit versioned approval, readable PDF and DOCX downloads; edits invalidate approval. |
| FR-16 | P1 | Optional wellbeing | Defaults off; pacing changes require consent; wellbeing never affects matching, grading or résumé claims. |
| FR-17 | Later | Broad competency coverage | Additional validated activity families and career-specific templates follow the complete MVP. |
| FR-18 | Excluded | Applications and employer scoring | No automated applications, employer-facing qualification scores or hiring guarantees. |

## Required boundaries

- Authenticate with a verified identity; enforce ownership on every record and file lookup.
- Treat résumé/job/resource text as data. It cannot change system instructions, grant permissions or invoke privileged actions.
- Private uploads/exports use expiring links. Delete owned data and files according to the specified retention policy; redact logs.
- Keep reviewed grading bundles and expected answers out of learner payloads, tutor context, model-provider requests and public source control.
- No arbitrary learner code execution in the API process. An activity needs a registered renderer, bounded executor and grader.
- Do not infer employment, credentials, years of experience or production ownership from a platform exercise.
- Keyboard navigation, clear labels, readable error/recovery states and server-persisted resume points are required.

## Shared engineering decisions

The exact wire/schema definitions are in [the contract package](../contracts/v0.1/README.md). These decisions supersede conflicting branch-local conventions when this baseline is adopted:

| Decision | v0.1 behavior |
| --- | --- |
| Public API | `/api/v1`, snake_case, UUID IDs, UTC timestamps and fractional scores. |
| Identity | Supabase Auth JWT; ownership derived from subject, never `X-User-Id`. |
| Long operations | Always 202 plus workflow ID; poll and follow a typed result reference. |
| Writes | Idempotency key; revision/hash guards for confirmation and approval. |
| Source history | Immutable job/profile/goal snapshots, distinct provider and data-origin fields. |
| Templates | Not required for learning plans; reviewed criteria remain necessary for later competency assessment. |
| Diagnostics | Placement-only; prior knowledge can shorten instruction but final practical evidence remains necessary. |
| Retry policy | At most three failed final attempts; fresh reviewed tests required; ambiguity does not count as learner failure. |
| Provider routing | OpenAI or Nebius selected on server; task overrides allowed; automatic cross-provider fallback off by default. |
| Export | Exact approved content version; separate PDF/DOCX artifact records; no silent regeneration on URL renewal. |

The initial cache-age, retention, timeout and retry limits in the normative contract are implementation defaults, not claims about the original product document. Model IDs, reviewer identities and production template content are deployment/content inputs; examples do not supply fake approvals.

## Learning material after acceptance

Accepted plans support original teaching for each milestone using its chosen mode
and saved resource descriptions. Text provides explanations, an example and self-checks;
hands-on adds setup, practice steps and a deliverable. Save material and restore it
without another model call. No reviewed template, full-course scraping or independent
assessment is required. See [material acceptance criteria](LEARNING_MATERIAL.md).

## Implementation quality

The MVP must stay small, clearly organized and easy to change. Follow [implementation guidelines](IMPLEMENTATION_GUIDELINES.md): reuse the existing stack, keep domain logic, prompts and persistence in their modules, use concise task-specific prompts, and justify each new dependency or abstraction. Logical records do not mandate separate physical tables or services. Each implementation PR must demonstrate its acceptance criteria with the smallest clear change.

## Release gates

The learning-plan slice is specified in [LEARNING_PLANS.md](LEARNING_PLANS.md).
Assessment/export gates below apply when those separate capabilities ship; they
do not block learning plan generation.

1. Complete gap → saved free/paid resources → skill goal → modality → plan review → acceptance and reload with mocks disabled. Exercise all three modalities; no template or rubric required.
2. Show empty resources/provider failures honestly; reject unsaved resource IDs and cross-user records; never substitute RAG or award mastery.
3. Demonstrate real job retrieval and honest zero-result/provider-outage/stale-cache handling.
4. Known passing, failing and ambiguous submissions produce expected outcomes; failed critical checks cannot pass.
5. Attempts retain frozen versions even after new template publication; private answers and test keys never reach learner or model surfaces.
6. Duplicate submissions/worker recovery create one logical result; only valid final passes update demonstrated skills.
7. Edited résumé content requires reapproval; both export formats match the approved content and have zero unsupported new claims in the acceptance set.
8. Cross-user access fails, deletion removes owned data/files, unsafe external instructions are rejected, and equivalent skill profiles receive equivalent rankings regardless of irrelevant personal details.
9. Keyboard-only completion and refresh/restart recovery work, including meaningful errors and empty states.
10. The same task fixtures pass schema/business checks on both configured OpenAI and Nebius routes; live capability reports are recorded for exact deployed model/adapter combinations.

See [acceptance.csv](../contracts/v0.1/acceptance.csv) for check IDs and the [implementation handoff](IMPLEMENTATION_HANDOFF.md) for assigned workstreams and dependencies.

## Source and precedence

Based on the user-supplied `CareerBridge_MVP_Technical_Design.pdf`, clarified product scope, and repository review. The private source PDF is not copied into this public repository. Its RAG examples are demonstration content only. The earlier branch-specific API and DB documents remain historical references; v0.1 is the proposed target contract, not a statement that the current code already implements it.

## Formative learning check

After a completed plan, offer five scored quiz questions and a written practice task,
with AI feedback and durable saved results. This learning check needs no reviewed
template and never writes verified mastery. Independent assessment criteria remain
a separate boundary. See [learning-check acceptance criteria](LEARNING_CHECKS.md).

## Saved progress and next steps

Show accepted-plan milestone completion separately from saved formative check results.
Recommend revisiting flagged milestones, resuming unfinished work/checks, accepting plans,
and learning unaddressed gaps from the active goal. Use deterministic rules over owned
saved data, without model calls or mastery promotion. See [contract and acceptance criteria](PROGRESS_OVERVIEW.md).
