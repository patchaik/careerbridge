# CareerBridge

Target a role, identify an evidence-backed skill gap, learn and practice, demonstrate a competency, and approve a truthful résumé update.

## Shared MVP implementation baseline

- [Minimal MVP implementation guidelines](docs/IMPLEMENTATION_GUIDELINES.md)
- [Wave 1 implementation and setup](docs/WAVE1_IMPLEMENTATION.md)
- [Requirements](docs/MVP_REQUIREMENTS.md)
- [Implementation handoff, issues and dependencies](docs/IMPLEMENTATION_HANDOFF.md)
- [Shared API/schema/template contracts](contracts/v0.1/README.md)
- [MVP delivery tracker](https://github.com/Shrezz/careerbridge/issues/21)

The general platform supports a small set of reviewed learning/assessment templates; RAG is an optional example. OpenAI and Nebius are interchangeable server-side model providers. These documents define the target implementation, not a claim that all features already work.

## Existing data layer

- [Database setup and functions](database/README.md)
- [Earlier DB design](docs/DB_DESIGN.md)
- [Earlier API contract](api/README.md)

New work should follow `contracts/v0.1`; earlier documents remain historical until implementation migration is complete.
