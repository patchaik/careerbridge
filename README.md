# CareerBridge

Target a role, identify an evidence-backed skill gap, and build a learning plan with
saved resources, a concrete goal and your preferred modality.

The `stitch-1` integration supports Supabase sign-in, résumé upload and confirmation,
live Keenable job/resource discovery, gap analysis, free/paid resource persistence,
learning plans and generated milestone material through the shared OpenAI/Nebius
gateway. Langfuse tracing is optional. Learning completion is self-reported;
independent competency assessment remains separate and unfinished.

Start with **[Fresh-checkout setup and end-to-end testing](docs/LOCAL_E2E.md)**.
A checkout needs your development Supabase configuration, model credentials and
local capability reports before live flows work. No credentials are committed.

- [Formative learning checks and saved feedback](docs/LEARNING_CHECKS.md)
- [Saved learning progress and acceptance criteria](docs/LEARNING_PROGRESS.md)
- [Milestone learning material](docs/LEARNING_MATERIAL.md)
- [Learning goals, resources and plans](docs/LEARNING_PLANS.md)
- [Live job search](docs/LIVE_JOB_SEARCH.md)
- [Tracing and diagnostics](docs/OBSERVABILITY.md)
- [Deployed API contract](api/openapi.yaml)
- [Requirements](docs/MVP_REQUIREMENTS.md)
- [Minimal implementation guidelines](docs/IMPLEMENTATION_GUIDELINES.md)
- [Implementation handoff](docs/IMPLEMENTATION_HANDOFF.md)
- [Canonical future API/schema contracts](contracts/v0.1/README.md)
- [Reconciliation history](docs/RECONCILIATION.md)

Use the setup guide above for current behavior; older integration notes contain
historical mock-auth and draft competency-template descriptions. Reviewed templates
are not required for resource-based learning plans. Broader `/api/v1` workflow and
independent assessment integration are still future work.
