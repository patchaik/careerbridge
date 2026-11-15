# CareerBridge

Turn a target role into a focused learning plan. CareerBridge connects your confirmed
skills with requirements from real job postings, helps you choose resources for a
skill gap, and saves your lessons, learning checks and next steps.

**Status: development MVP.** The integrated learning journey is on `main`.
Learning completion is self-reported, and learning-check feedback is formative.
Neither establishes independently verified competency.

## The learning journey

1. **Build your profile.** Sign in with Auth, upload a PDF/DOCX résumé or enter skills manually, then review and confirm the profile.
2. **Choose a direction.** Set a target role, location and seniority. Search live job postings through API search and select postings for comparison.
3. **Understand the gaps.** Compare confirmed skills with sourced job requirements. Saved gap analyses include supporting excerpts and links. Missing evidence is not treated as proof that you lack a skill.
4. **Choose resources and a goal.** Discover free, paid, mixed and unknown-price resources for a selected gap. Choose resources, write a concrete learning goal, and select text, hands-on practice or both.
5. **Learn at your pace.** Review and accept a plan, generate milestone material, mark milestones complete or reopen them, and return to saved work.
6. **Check understanding.** After completing all milestones with saved material, answer five multiple-choice questions and a short written practice task. Revisit the saved score, explanations and written feedback.
7. **See what comes next.** The Progress page summarizes saved plans and suggests reviewing a milestone, continuing a plan or addressing another gap.

Resource selection does not purchase or enroll in courses. Hands-on activities are
completed outside the app; submitted code is not executed.

The Progress page covers the latest 50 saved resource-based plans. Quiz scoring uses\
a server-held, AI-generated answer key; written feedback is also AI-generated.\
A successful check does not close a\
job-market skill gap or add verified evidence.

## Stack and repository layout

The browser uses React, TypeScript, Vite and Tailwind CSS. A Python/FastAPI backend
coordinates domain logic and Supabase PostgreSQL/storage. Keenable supplies job
and resource discovery; the shared model gateway supports OpenAI and Nebius.
The browser uses Supabase directly for authentication and the API for app data.

| Path | Purpose |
| --- | --- |
| `src/` | Pages, components, authentication, hooks and typed API clients |
| `careerbridge/` | FastAPI app, domain flows, model gateway and versioned prompts |
| `database/` | Persistence functions, base schema and explicit migrations |
| `deployment/` | Model-routing examples and capability-check fixtures |
| `scripts/` | Provider capability checks and live flow checks |
| `tests/` | Backend unit and integration tests |
| `api/openapi.yaml` | Current API contract; some legacy operations are still incomplete |
| `contracts/v0.1/` | Broader target contracts, schemas and offline validation |
| `docs/` | Setup, feature behavior, acceptance criteria and implementation notes |

## Run locally

Use **Python 3.12** and **Node.js 24**, the versions recorded in the setup guide.
The live journey also needs a development Supabase project, a supported model
provider and access to Keenable. Copying the example environment alone does not
enable the live flow.

### 1. Install

```sh
git clone --branch main https://github.com/Shrezz/careerbridge.git
cd careerbridge
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-test.txt
npm ci
cp .env.example .env
```

The shell commands in this guide use macOS/Linux syntax.

### 2. Configure the live environment

Edit `.env`:

| Setting | Value |
| --- | --- |
| `CAREERBRIDGE_ENV` | `development` |
| `AUTH_MODE` | `supabase` |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | The same development Supabase project URL |
| `SUPABASE_SECRET_KEY` | Backend secret/service-role key |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | The same project's public key |
| `DATABASE_URL` | PostgreSQL connection for migrations and transactional intake |
| `CAREERBRIDGE_ANALYST_MODE` | `llm` |
| `CAREERBRIDGE_SEARCH_MODE` | `live` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Your provider key and available structured-output model ID |
| `VITE_USE_MOCKS` | `false` |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` |
| `CORS_ORIGINS` | `http://localhost:3002,http://127.0.0.1:3002` |

Keep backend credentials out of `VITE_` settings and never commit `.env`.
The example analyst/search modes are `mock`; update them as shown above.
Learning-resource discovery, plans, material and checks require live providers and
capability reports even when other parts use mocks.

`KEENABLE_API_KEY` is optional for the existing public search/fetch endpoints.
For optional tracing, configure `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and
`LANGFUSE_BASE_URL` for the same project/region.

In Supabase, enable email/password Auth and configure the site URL and permitted
redirects for the local UI. Confirm your test account's email if confirmation is
enabled. Auth and the backend must use the same project.

For a **new empty development Supabase project**, initialize the schema with:

```sh
python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy; runpy.run_module("database.migrate", run_name="__main__")'
```

For an existing project, review its schema and migrations before applying changes.
Migrations run explicitly, not at API startup. See the
[database guide](database/README.md) and [detailed local setup](docs/LOCAL_E2E.md).

### 3. Prepare model routes and capability reports

```sh
cp deployment/resume-model-routing.example.yaml deployment/model-routing.yaml
for task in job resource plan lesson check; do
  cp "deployment/$task-model-routing.example.yaml" "deployment/$task-model-routing.yaml"
done
```

The examples select OpenAI. To use Nebius, set `active_profile: nebius` in all six
local routing files and configure `NEBIUS_API_KEY` and `NEBIUS_MODEL` instead.
Only the selected provider's credentials are required; cross-provider fallback
is disabled in the examples.

Generate reports for the selected model, prompt and schema. These checks make
**billable synthetic provider calls**. Run sequentially from the repository root
with the virtual environment active:

```sh
for task in resume job resource plan lesson learning_check; do
  python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy, sys; module = sys.argv.pop(1); runpy.run_module(module, run_name="__main__")' \
    "scripts.check_${task}_model" --profile openai || break
done
```

Use `--profile nebius` when you selected Nebius. All six checks must pass before
using the full journey. Reports are local, ignored by Git and expire after seven
days; rerun the relevant checks when the model, prompt or schema changes.

### 4. Start the API and frontend

In terminal 1, with the virtual environment active:

```sh
python -m uvicorn careerbridge.main:app --env-file .env --host 127.0.0.1 --port 8000
```

In terminal 2, from the repository root:

```sh
npm run dev
```

Open [the local sign-in page](http://localhost:3002/signin). Check
[API health](http://127.0.0.1:8000/api/health) for `database: true`.
Vite uses port 3002 with strict port selection; stop an old instance if it is busy.
Restart both processes after configuration changes.

Follow the learning journey above with a synthetic résumé. Reload saved plans,
material and feedback, then sign out and back in to verify that Learn and Progress
restore your saved work.

## Development checks

From the repository root, with dependencies installed:

```sh
python -m pytest tests careerbridge/tests -q
python contracts/v0.1/validate_contract.py
npm run lint
npm run build
```

PostgreSQL integration tests in `tests/` require `TEST_DATABASE_URL` pointing to an
isolated test server with permission to create/drop test databases; otherwise those
tests skip. Contract validation checks the target artifacts, not implementation
coverage of every future endpoint. There is currently no GitHub Actions CI workflow.

For live checks, use a development/test Supabase project and load `.env` as shown in
[detailed local setup](docs/LOCAL_E2E.md):

- `scripts.check_discovery_flow`: live job discovery, gap comparison and resource discovery.
- `scripts.check_learning_flow --progress`: resource discovery, plans, lessons, saved completion and reopening.
- `scripts.check_learning_check_flow`: question generation, submission, feedback and persistence.

These checks make provider calls and create disposable learner data. They clean up
their private fixtures by default; shared public resource catalog entries remain.
See each script's `--help` for API URL and output-file arguments.

## Documentation

| Topic | Guide |
| --- | --- |
| Setup, live checks and troubleshooting | [Local end-to-end guide](docs/LOCAL_E2E.md) |
| Profile persistence and résumé extraction | [Profiles](docs/PROFILE_PERSISTENCE.md) · [Résumé model](docs/RESUME_MODEL.md) |
| Job evidence and gap analysis | [Live job search](docs/LIVE_JOB_SEARCH.md) |
| Resource selection, goals and plans | [Learning plans](docs/LEARNING_PLANS.md) |
| Generated lessons and self-reported completion | [Milestone material](docs/LEARNING_MATERIAL.md) · [Learning progress](docs/LEARNING_PROGRESS.md) |
| Quiz and written feedback | [Formative learning checks](docs/LEARNING_CHECKS.md) |
| Saved progress and recommendation rules | [Progress overview](docs/PROGRESS_OVERVIEW.md) |
| Tracing and diagnostics | [Observability](docs/OBSERVABILITY.md) |
| Current API and future contracts | [API schema](api/openapi.yaml) · [Target contracts](contracts/v0.1/README.md) |
| Product scope and implementation guidance | [Requirements](docs/MVP_REQUIREMENTS.md) · [Guidelines](docs/IMPLEMENTATION_GUIDELINES.md) |
| Integration background | [Handoff](docs/IMPLEMENTATION_HANDOFF.md) · [Reconciliation](docs/RECONCILIATION.md) |

Some detailed guides retain historical `stitch-1` or “before merge” instructions.
Use `main` for the integrated features described here. Future contract requirements
and older demo descriptions should not be read as completed functionality.
