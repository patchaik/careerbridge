# CareerBridge

An AI-for-Good Buildathon project: a job-first upskilling app. This repo combines three parts
that were developed on separate branches and are being stitched together on `stitch-1`:

- **UI** (`src/`) — React + Vite + Tailwind frontend. See inline docs and `docs/API_PROPOSALS.md`.
- **Database layer** (`database/`, `database_tests/`, `api/openapi.yaml`) — a Python package over
  Supabase that is the single source of truth for storage, plus the official API contract the
  backend must expose. See `database/README.md`, `api/README.md`, and `docs/DB_DESIGN.md`.
- **AI backend** (`careerbridge/`) — a FastAPI app with LangGraph agents (résumé analysis, job
  search, learning paths, assessment). See `careerbridge/` and `docs/INTEGRATION_NOTES.md` for how
  it's wired to Supabase and the contract in `stitch-1`.

Full instructions for running everything together on Windows (env vars, both servers, the
database tests, mock mode) are in **`docs/INTEGRATION_NOTES.md`**.

## Frontend

```sh
npm install
npm run dev
```

Runs on `http://localhost:3002`. See `.env.example` for `VITE_USE_MOCKS` / `VITE_API_BASE_URL`.

## Backend

```sh
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn careerbridge.main:app --reload --port 8000
```

Requires a `.env` with `SUPABASE_URL` / `SUPABASE_KEY` (service role — never commit this) and, for
mock mode, `CAREERBRIDGE_ANALYST_MODE=mock` / `CAREERBRIDGE_SEARCH_MODE=mock`. See
`docs/INTEGRATION_NOTES.md` for the full setup and what's real vs. mocked vs. not yet available.
