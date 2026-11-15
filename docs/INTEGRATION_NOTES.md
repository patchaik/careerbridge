> **Legacy stitch integration:** New MVP work follows [contracts/v0.1](../contracts/v0.1/README.md). Read [reconciliation status](RECONCILIATION.md) for the current baseline and remaining JWT, workflow and deterministic assessment requirements. The behavior below is retained for prototype reference.

# Integration notes (stitch-1)

How the UI (`src/`), the database layer (`database/`), and the AI backend
(`careerbridge/`) are stitched together on `stitch-1`, what's real vs. mock
vs. not available yet, and open questions for the team.

## Running everything on Windows

Two terminals, after cloning `stitch-1`.

**Terminal 1 — backend**
```powershell
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scripts\fix_blocked_native_deps.py   # see "Windows-only blocker" below
uvicorn careerbridge.main:app --reload --port 8000
```

**Terminal 2 — frontend**
```powershell
npm install
npm run dev
```

**`.env`** (repo root, never committed):
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<secret key, sb_secret_... or service_role JWT>
AUTH_MODE=supabase
CAREERBRIDGE_ANALYST_MODE=mock
CAREERBRIDGE_SEARCH_MODE=mock
CORS_ORIGINS=http://localhost:3002
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
`OPENAI_API_KEY` / `KEENABLE_API_KEY` are only needed if you later drop the
two `CAREERBRIDGE_*_MODE=mock` lines to run the agents live.

`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are safe to be public —
never put `SUPABASE_KEY` (the secret key) in a `VITE_` variable.

**Supabase dashboard settings required** (Authentication → Settings /
URL Configuration):
- Email provider **on**, with **"Confirm email" enabled** (sign-up requires
  verification before sign-in works).
- **Site URL**: `http://localhost:3002`
- **Redirect URLs**: `http://localhost:3002/**` (covers both
  `/auth/callback` and `/reset-password`)

To run the UI purely on mocks (no backend needed), set `VITE_USE_MOCKS=true`
in a `.env.local` (gitignored, overrides `.env`, no need to touch the real
`.env`) rather than editing the committed one.

**Database tests** (confirms Supabase is reachable and every integrity rule
holds — no backend needed):
```powershell
python database_tests\test_db_setup.py
python database_tests\test_db_layer.py
```

**Backend smoke test** (confirms the whole product flow end to end — needs
the backend running):
```powershell
python scripts\smoke_test.py
```

**Mock-skills unit test**:
```powershell
python -m careerbridge.tests.test_mock_skills
```

## What's real vs. mock vs. 501

| Area | Status |
| --- | --- |
| Users (create/get/delete/export) | Real |
| Onboarding parse, profile get/confirm | Real |
| Goals (create/list) | Real |
| Jobs search, get job | Real |
| Skills analyze, gap analysis get | Real |
| Learning paths (generate/get/approve/status), resources list | Real |
| Arena tutor | Real |
| Assessments start/submit, progress | Real |
| Résumé drafts/export | **501** — agents don't support it |
| Diagnostics | **501** — P1, not implemented |
| Wellbeing | **501** — P1, not implemented |
| Interest analysis, résumé critique, role outlook, role recommendations, recommended jobs | **Mock in the UI** — no contract endpoint exists; see `docs/API_PROPOSALS.md` |
| Auth (sign up/in, email verification, password reset) | **Real** — Supabase Auth, always, regardless of `VITE_USE_MOCKS` (see below) |

`src/lib/api/endpoints.ts` is the single switch; `VITE_USE_MOCKS=true` forces
everything to mock regardless of that table.

**Only `/start`, `/interests` (profile/skills portion), and sign-in/sign-up
actually call real endpoints from the UI right now** — those are the only
built pages that touch onboarding/profile data. The rest of `src/lib/api/`
(goals, jobs, skills/analyze, paths, resources, arena, assessments,
progress) is wired to the right real paths/methods/auth for when Phase 4+
pages get built, but **the response shapes in `src/lib/types.ts` still
reflect the pre-stitch mock design** for those — they were invented before
`api/openapi.yaml` existed and don't match the real contract's shapes
closely enough to map losslessly without a real UI consuming them to design
against. Each affected file (`src/lib/api/{goals,jobs,skills,paths,
resources,arena,assessments,progress}.ts`) has an inline `NOTE:` comment
describing its specific mismatch. This was a deliberate scope call: nothing
in the current UI renders these types, so leaving them until the page that
needs them is built — and can be designed against the real shape directly —
seemed better than guessing now and having to redo it anyway.

## Auth: Supabase Auth end to end

Sign-up/sign-in/password-reset are **real Supabase Auth**, unconditionally —
not switched by `VITE_USE_MOCKS` or `src/lib/api/endpoints.ts` at all (auth
isn't an "endpoint" in that table; `src/context/AuthContext.tsx` talks
directly to `src/lib/supabase.ts`'s client, which uses only the public
publishable key and only Supabase's Auth API — it never queries tables
directly, since every table has RLS enabled with no public policies).

**Frontend flow:**
- `signUp` calls `supabase.auth.signUp` with `full_name`/`username`/`consent`
  in user metadata and `emailRedirectTo: /auth/callback`. It does **not**
  sign the user in — Supabase requires email confirmation first (dashboard
  setting above), so `SignUpPage` shows a "check your email" screen with a
  cooldown "Resend email" button (`supabase.auth.resend`) instead of
  navigating anywhere.
- `/auth/callback` is where the verification link lands. supabase-js
  exchanges the link's code for a session automatically on load
  (`detectSessionInUrl: true`); the page just waits for `getSession()` to
  resolve, then routes to `/start` (new users) or the furthest unlocked
  step. An expired/invalid link leaves no session — shown as a friendly
  error with a link back to `/signin`.
- `signIn` calls `supabase.auth.signInWithPassword`. An unconfirmed account
  throws a distinguishable `EmailNotVerifiedError` (checked via the error's
  `code`/message) so `SignInPage` can show "Please verify your email first"
  with its own resend button, instead of a generic error.
- `forgotPassword` calls `supabase.auth.resetPasswordForEmail` with
  `redirectTo: /reset-password`, and **always** reports success regardless
  of the outcome — matching Supabase's own anti-enumeration behavior on that
  endpoint (never reveal whether an email is registered).
- `/reset-password` relies on the same `detectSessionInUrl` mechanism: the
  recovery link already signs the user in (temporarily) on load. The page
  checks for that session, shows "new password" + confirm, and calls
  `supabase.auth.updateUser({ password })` — which both sets the password
  and leaves the user signed in to continue, no separate sign-in step.
- `AuthProvider` tracks the session via `getSession()` on mount plus
  `onAuthStateChange`, exposing `isInitializing` so route guards
  (`Protected`/`ProtectedBranch`) wait for the initial check instead of
  flashing a redirect to `/signin` before a stored session loads.
- The API client (`src/lib/api/client.ts`) sends
  `Authorization: Bearer <access_token>` (read fresh from
  `supabase.auth.getSession()`, auto-refreshed by supabase-js) on every real
  request instead of the old `X-User-Id` header. `POST /api/users` is no
  longer called from the frontend at all.

**Backend flow (`careerbridge/main.py`, `database/users.py`):**
- `AUTH_MODE` env var: `supabase` (default) validates the bearer token;
  `header` falls back to trusting a raw `X-User-Id` header with **zero**
  verification — dev/test only, never set this in a deployment.
- `database.users.get_auth_user(token)` calls the Supabase client's
  `auth.get_user(token)` (works regardless of which key type the client
  itself was created with) and caches the result for 60s so a page firing
  several requests doesn't re-validate every time. Returns `None` for any
  invalid/expired/malformed token.
- `database.users.get_or_link_app_user(auth_id, email, metadata)` resolves
  the app `users` row: by id first (the normal case), then by email (links
  an older pre-Supabase-Auth row), then creates one with `id = auth_id`,
  `auth_provider = 'supabase'`, and `consent_at` from the metadata's
  `consent` flag. No schema change needed — `users.id` has no special
  default that blocks inserting an explicit UUID.

**Gotcha found while building this** (relevant to anyone writing scripts
against the Supabase Python client, e.g. `scripts/smoke_test.py`):
`client.auth.sign_in_with_password(...)` mutates **that client instance's
own session**, silently swapping its Authorization header from whatever key
it was created with to the signed-in user's access token for every later
call — including plain `table()` queries. Doing this on the shared
`database.client.get_client()` singleton (the service/secret-key client
used for admin operations everywhere else in the backend) breaks every
subsequent admin call in the same process with `permission denied for table
...` errors that look like an RLS/grants problem but are actually "this
client is now making requests as the signed-in user, not the service role."
Always sign in on a separate, throwaway client instance
(`supabase.create_client(url, key)`) instead of the shared one.

## Storage mapping (careerbridge/store.py)

| Old (`careerbridge/db.py`, local Postgres) | Now (`database/` → Supabase) |
| --- | --- |
| `profiles` (skills JSON) | `candidate_profiles` + `candidate_skill_evidence` + `skills`, via `profiles.create_profile` (file in the private bucket), `get_or_create_skill`, `add_skill_evidence_bulk`, `confirm_profile` |
| `job_analyses` | `career_goals` + `job_postings` + `job_skill_requirements` + `gap_analyses`, via `users.create_goal`, `jobs.upsert_job_posting`, `add_job_requirements`, `create_gap_analysis`, `gap_report` |
| `resource_searches` | `learning_resources`, via `learning.add_resource` / `list_resources` (max 5 free + 5 paid, enforced in the schema) |
| `learning_paths` | `learning_paths` + `rubric_versions`, via `learning.create_path` + `mastery.create_rubric` / `approve_rubric` / `freeze_rubric` |
| `assessment_attempts` | `assessment_attempts` + `verified_skill_evidence`, via `mastery.start_attempt`, `submit_attempt`, `record_verified_evidence`. Mock-mode results still go through the same real grading/evidence path — a mock `passed` attempt *does* create verified evidence, same as a live one would. Nothing in the agents or `store.py` special-cases mock mode to skip this. |
| `assessment_sets` (questions + answer keys) | **No dedicated table.** Two new, additive functions in `database/mastery.py` — `save_pending_assessment_set` / `get_pending_assessment_set` — stash the generated quiz + answer keys in `assessment_attempts.quiz_results_json` under a reserved `_pending_assessment_set` key while the attempt is `in_progress`. `submit_attempt`'s real results overwrite that field, so answer keys never leak past grading. Answer keys are also never returned to the client at any point (`main.py` strips `correct_answer` before responding to `/assessments/start`). Chosen over a new table because it needed zero schema change and the data is genuinely transient (useless after grading). If the team would rather have a dedicated table, that's a straightforward follow-up migration. |
| `workflows` job queue | See below — no separate queue; see "Background jobs." |

## Background jobs: no worker process

The old worker relied on raw Postgres features (`pg_try_advisory_lock`,
`FOR UPDATE SKIP LOCKED`) the Supabase client can't do. For this local MVP,
every AI task runs **synchronously, in-process**, inside the FastAPI request
that triggers it — there's no separate worker, no `DATABASE_URL`. Mock-mode
agents complete in milliseconds, so there's no real downside yet.

Each operation still writes a `workflow_runs` row (`careerbridge/
store.py`'s `record_workflow`): the task's semantic meaning maps to the
closest `workflow_runs.state` enum value (e.g. résumé parsing → `ONBOARDING`,
job search → `JOB_SEARCH`), and `{kind, status, stage, result, error}` goes
in `state_json`. `GET /api/workflows/{id}` reads this back, so it keeps
working and survives a restart even though nothing is actually "pending" by
the time the HTTP response is sent.

When live mode (`CAREERBRIDGE_ANALYST_MODE=llm` / `CAREERBRIDGE_SEARCH_MODE=
live`) makes requests slow enough that synchronous execution becomes a bad
UX, the natural next step is FastAPI `BackgroundTasks` (or a thread pool):
return the `workflow_runs` row immediately with `state`/`status=running`,
kick off the agent call in the background, and have it update the same row
on completion. The schema and `GET /api/workflows/{id}` route don't need to
change for that — only `store.py`'s functions would start returning before
the agent call finishes.

## Windows-only blocker (not a CareerBridge bug)

On this machine, a Windows Application Control / WDAC policy blocks two
compiled extensions — `xxhash` and `ormsgpack` — that `langgraph`/`langsmith`
import at module load time (internal, non-cryptographic task/trace IDs, and
checkpoint serialization that's unused since no graph here configures a
checkpointer). This breaks importing `langgraph` **at all**, even in mock
mode, since the import happens whether or not the functions are ever called.

`scripts/fix_blocked_native_deps.py` checks whether each import actually
works and, if not, replaces the package with a tiny pure-Python shim
providing only what's actually called. Neither shim is bit-compatible with
the real library — fine here since nothing in this stack checks that. Run
it once after `pip install -r requirements.txt`; safe to re-run, and it's a
no-op on a machine where the real packages import fine.

## Mismatches between api/openapi.yaml and the agents' actual flow

Followed the contract and adapted the backend in every case (never edited
`openapi.yaml`):

1. **Job search vs. gap analysis.** The search agent's `analyze_jobs` node
   computes gaps *and* jobs in one pass. The contract splits this into
   `POST /api/jobs/search` (persist postings + requirements only) and
   `POST /api/skills/analyze` (separate endpoint, given `job_ids`). `store.
   py`'s `analyze_skills_flow` re-implements the same frequency/importance
   comparison as a plain Python set comparison over already-persisted
   `job_skill_requirements` + the confirmed profile — no second LLM call,
   just reading what's already in Supabase.
2. **Resource discovery has no trigger endpoint.** The old flow had an
   explicit "search resources" step before creating a learning path; the
   contract's `POST /api/paths/generate` takes only `{goal_id, skill}`, no
   `resource_search_id`. `generate_path_flow` triggers resource discovery
   internally (if no free resources exist yet for the skill) before calling
   the coach agent, so `GET /api/resources` is already populated by the time
   the path exists.
3. **Milestones lose the coach's richer content.** The coach agent's
   milestones carry `explanation`/`exercise`/`resource_urls`; the contract's
   `Milestone` schema is only `{id, title, concepts, mode, done}`. Only
   `title` survives into `learning_paths.milestones_json` right now. The
   richer content is meant to be delivered live via `POST /api/arena/tutor`
   instead (which `store.py`'s `tutor_flow` wires to `learning_coach.
   answer_question`) rather than baked into the path up front — but that
   means the milestone's `explanation` text itself isn't retrievable as
   data today, only as a tutor reply to a question. Worth a contract
   discussion if `/learn`/`/arena` end up wanting to show it directly.
4. **Job provider labels don't match.** The agents label results `"keenable"`
   (live) or `"synthetic"` (mock); `job_postings.provider` only allows
   `adzuna`, `greenhouse`, `cached`, `synthetic`. Mock mode is unaffected
   (`synthetic` matches). Live mode currently maps `"keenable"` → `"cached"`
   as a placeholder in `store.py`'s `search_jobs_flow` — not quite accurate
   (Keenable aggregates various sources), but the closest fit in the
   existing enum. Revisit if/when live discovery actually ships.
5. **`fallback_used` isn't really implemented.** The contract's `/jobs/
   search` response includes `fallback_used: true` for "live provider
   failed, served cached data instead." Since this stitch only exercises
   mock mode, `search_jobs_flow` always returns `fallback_used: false` —
   there's no separate cached-data path to fall back to yet.
6. **`situation` has no backend home.** See `docs/API_PROPOSALS.md`'s note
   at the bottom — it's UI/journey-state only right now, in both mock and
   real mode.

## Open questions for the team

- **Where should `assessment_sets` really live?** The reused-column
  approach above works and needed no schema change, but if assessments
  become a bigger part of the product, a dedicated table (with its own
  retention/audit story for served-but-unanswered question sets) is
  probably cleaner. Flag if you'd rather do that migration now.
- **`AUTH_MODE=header` cleanup.** The header fallback exists purely so
  someone without Supabase credentials handy can still exercise the API
  with `curl -H "X-User-Id: ..."` during local backend-only work. If that's
  never actually used, it's a dead code path (and a standing temptation to
  misconfigure in a deployment) worth removing later.
- **The gaps in `docs/API_PROPOSALS.md`** — five proposed endpoints
  (interest analysis, résumé critique, role outlook, role recommendations,
  recommended jobs) with no agent behind them yet. Whoever picks up Phase 4
  (`/target`, `/recommendations`, `/skills`) will hit these directly.
- **`situation`'s backend home** (see above) — `career_goals` seems like
  the more natural owner than `candidate_profiles` if the team wants it to
  inform `/api/roles/outlook` server-side later, but that's a product call,
  not just a schema one.
- **Switching mock → live AI.** Once `OPENAI_API_KEY` (and optionally
  `KEENABLE_API_KEY`) exist, drop `CAREERBRIDGE_ANALYST_MODE=mock` /
  `CAREERBRIDGE_SEARCH_MODE=mock` from `.env` and restart the backend — no
  code changes needed. Worth budgeting time to re-run `scripts/smoke_test.py`
  against live mode once keys exist, since live responses (real job
  postings, real LLM-generated rubrics/questions) will exercise validation
  paths (`JobPostingIn`, `Assessment`'s option-uniqueness checks, etc.) that
  mock mode's fixed outputs never hit.
- **`src/lib/types.ts` shapes for goals/jobs/skills/paths/resources/arena/
  assessments/progress** — flagged above; these need a real design pass
  once their pages (Phase 4+) are actually built, not a guess now.
