# Run the live MVP from a fresh checkout

The code for résumé upload/confirmation, job search/gaps, saved free/paid resources,
learning goals/plans, milestone material and Langfuse tracing is on `stitch-1`.
Milestone completion is available on the feature branch containing this guide until
its PR is merged. A pull alone is not enough: credentials, a Supabase schema and
provider capability reports are local deployment configuration, deliberately not
committed. Use Python 3.12 and Node 24 for the versions used in verification.

## Install and configure

```sh
git clone --branch stitch-1 https://github.com/Shrezz/careerbridge.git
cd careerbridge
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-test.txt
npm ci
cp .env.example .env
```

For this feature before merge, check out the PR branch after cloning. In `.env`:

| Setting | Value for live local testing |
| --- | --- |
| `CAREERBRIDGE_ENV` | `development` or `test` |
| `AUTH_MODE` | `supabase` |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | Same development project URL |
| `SUPABASE_SECRET_KEY` | Backend secret/service-role key; never a `VITE_` setting |
| `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Same project's public key |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Your key and available structured-output model ID |
| `CAREERBRIDGE_ANALYST_MODE`, `CAREERBRIDGE_SEARCH_MODE` | `llm` |
| `VITE_USE_MOCKS` | `false` |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` |
| `CORS_ORIGINS` | `http://localhost:3002,http://127.0.0.1:3002` |

`KEENABLE_API_KEY` is optional: without it the application uses Keenable's public
search/fetch endpoints. Live search still requires those endpoints to be available.
Tracing is optional: set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and
`LANGFUSE_BASE_URL` for the same project/region; omit keys to disable tracing.
Never copy backend credentials into frontend settings or commit `.env`.

For an existing configured development Supabase, reuse its URL/keys and schema.
For a **new empty Supabase project**, set `DATABASE_URL` to its PostgreSQL connection
and run `python -m database.migrate` with `.env` loaded as below. This creates the
base schema, private bucket and versioned intake migration. Review migrations before
applying to an existing database; do not reset it. Progress itself needs no migration.
Enable email/password Auth. Set the site's URL and permitted redirects to your local
UI URL in Supabase Auth configuration. Create a test account through the UI and
confirm its email if email confirmation is enabled. Auth and API must use the same
project. The browser only uses Supabase for authentication; data goes through the API.

## Prepare model routes

```sh
cp deployment/resume-model-routing.example.yaml deployment/model-routing.yaml
for task in job resource plan lesson; do
  cp "deployment/$task-model-routing.example.yaml" "deployment/$task-model-routing.yaml"
done
```

The examples select OpenAI. To use Nebius, set `active_profile: nebius` in each local
routing file, configure `NEBIUS_API_KEY`/`NEBIUS_MODEL`, and replace `openai` below
with `nebius`. Both keys are not required. Automatic cross-provider fallback is off.
These checks make billable synthetic calls. Run sequentially from the repo root:

```sh
python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy; runpy.run_module("scripts.check_resume_model", run_name="__main__")' --profile openai
python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy; runpy.run_module("scripts.check_job_model", run_name="__main__")' --profile openai
python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy; runpy.run_module("scripts.check_resource_model", run_name="__main__")' --profile openai
python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy; runpy.run_module("scripts.check_plan_model", run_name="__main__")' --profile openai
python -c 'from dotenv import load_dotenv; load_dotenv(".env"); import runpy; runpy.run_module("scripts.check_lesson_model", run_name="__main__")' --profile openai
```

The same dotenv/runpy wrapper works for `database.migrate` and the live check scripts
below. This avoids exporting or echoing secrets in the terminal. Reports are ignored,
bound to the selected model/prompt/schema and expire after seven days; rerun checks
when expired or configuration changes. Do not copy another model's reports.

## Start and test

Terminal 1, activated virtualenv, repo root:

```sh
python -m uvicorn careerbridge.main:app --env-file .env --host 127.0.0.1 --port 8000
```

Terminal 2, repo root:

```sh
npm run dev
```

Open `http://localhost:3002/signin`. The UI is real Supabase Auth, not mocked sign-in.
Check `http://127.0.0.1:8000/api/health` for `database: true`. Sign in, upload a small
synthetic PDF/DOCX, confirm supported skills, choose a target role, search jobs,
select jobs and analyze gaps. Select a gap, pull resources, choose free/paid options,
set a concrete learning goal and select text, hands-on or both. Review/accept the
plan and generate each milestone's material. With this feature merged, mark complete,
refresh, reopen, and sign out/in to resume from Learn.

Automated live checks (load `.env` with the wrapper above):

```sh
python -m scripts.check_discovery_flow --base-url http://127.0.0.1:8000 --output discovery-check.json
python -m scripts.check_learning_flow --progress --base-url http://127.0.0.1:8000 --output learning-progress-check.json
```

The second command needs this feature branch; on earlier `stitch-1` use `--materials`.
Checks create disposable learners and clean their private records; shared public
resources remain. The learning check seeds a synthetic skill gap, then uses live
Keenable, OpenAI/Nebius and Supabase. Browser verification covers the UI separately.
There is no repository CI workflow yet; these checks are local, not an automatic
GitHub merge gate. Isolated SQL tests additionally need `TEST_DATABASE_URL`.

## If it fails

- `permission denied`: backend requires the secret/service-role key and schema grants.
- Profile missing or stale UI: API and frontend must point to the same project/API;
  restart both after editing configuration. Check `.env.local` and shell overrides.
- Capability/report error: rerun the matching model check with the current model ID.
- Resource discovery/provider failure: inspect the server's stage/reason diagnostics
  or configured Langfuse trace. No mock results replace a failed live search.
- Port already occupied: stop your old server, or change Vite's port, API URL and
  CORS together. Use the URL printed by Vite.

This is a development MVP. Independent mastery assessment and the broader canonical
`/api/v1` workflow are still incomplete; self-reported completion is not mastery.
