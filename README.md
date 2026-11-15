# CareerBridge

Target a role, identify an evidence-backed skill gap, learn and practice, demonstrate a competency, and approve a truthful résumé update.

This baseline combines the latest `stitch-1` UI/Supabase/agent integration with PR #3's contracts and PR #22's DB/model gateway. Existing onboarding works against the legacy API; the canonical MVP integration remains in progress.

- [Reconciliation, verified behavior and next work](docs/RECONCILIATION.md)
- [Requirements](docs/MVP_REQUIREMENTS.md)
- [Minimal implementation guidelines](docs/IMPLEMENTATION_GUIDELINES.md)
- [Implementation handoff and issue dependencies](docs/IMPLEMENTATION_HANDOFF.md)
- [Canonical API/schema/template contracts](contracts/v0.1/README.md)
- [Wave-one migrations and model gateway](docs/WAVE1_IMPLEMENTATION.md)
- [Retained stitch setup and prototype behavior](docs/INTEGRATION_NOTES.md)

## Local development

```sh
python -m venv .venv
# Activate .venv using the command for your shell.
python -m pip install -r requirements.txt -r requirements-test.txt
cp .env.example .env
npm ci
```

Keep credentials in `.env`; use `SUPABASE_SECRET_KEY` for the server. Existing `SUPABASE_KEY` secret/service-role configurations remain supported. `DATABASE_URL` is a separate SQL connection for reviewed migrations and transactional repositories.

The retained development API runs with `uvicorn careerbridge.main:app --host 127.0.0.1 --port 8000`; the UI runs with `npm run dev`. Review the integration notes first: sign-in is still mocked, identity uses caller-supplied `X-User-Id`, and some operations remain mock or unavailable. These routes are not authenticated production services. Use `VITE_USE_MOCKS=true` for an offline UI preview.

New work follows `contracts/v0.1`; older API documents are historical. Reviewed competency templates support a general platform with RAG as an optional example. OpenAI/Nebius routing is server-side, and automatic cross-provider fallback stays off. Existing agents still need gateway integration.
