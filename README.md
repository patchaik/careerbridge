# CareerBridge backend

A small FastAPI backend with PostgreSQL, a background worker, and LangGraph agents for resume analysis, job and resource discovery, personalized learning, and assessment. The included UI covers resume upload and confirmation; use `/docs` for the remaining flows.

## Requirements and setup

- Python 3.10 or later and PostgreSQL.
- `OPENAI_API_KEY` for LLM extraction, learning plans, and assessment. `OPENAI_MODEL` selects the model (default `gpt-4o-mini`).
- `KEENABLE_API_KEY` is optional; without it, the discovery agent uses Keenable's public endpoints.

This is a **local, single-user prototype** without authentication or per-user access controls. Do not expose it to other users or the public internet. Resume text is sent to the configured model provider. Uploaded file bytes are removed once parsing succeeds or fails; the extracted skills and excerpts remain in PostgreSQL. Scanned PDFs need OCR, which is not included.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL='postgresql://shreyven@localhost:5432/careerbridge'
export OPENAI_API_KEY='your-key'
# Optional: export OPENAI_MODEL='your-model'
# Optional: export KEENABLE_API_KEY='your-key'
uvicorn careerbridge.main:app --reload
```

In a second terminal, activate the environment, set the same variables, and start the worker:

```sh
python -m careerbridge.worker
```

Open `http://127.0.0.1:8000/` for the resume UI or `/docs` for the API. The database user needs permission to create tables. The app initializes tables on startup. Run one worker; an advisory lock enforces this and interrupted work is requeued on restart.

### Mock mode

To run without a network search or LLM calls, set **both** variables in the worker terminal before starting it:

```sh
export CAREERBRIDGE_ANALYST_MODE=mock
export CAREERBRIDGE_SEARCH_MODE=mock
python -m careerbridge.worker
```

Resume extraction recognizes only Python, Java and SQL. Search results and assessment questions are synthetic fixtures, clearly labeled as such, and mock assessment results do not create verified evidence. Restart the worker after changing modes. To use live discovery, omit `CAREERBRIDGE_SEARCH_MODE` or set it to `live`; live discovery uses an LLM for structured interpretation of fetched pages.

Existing learning paths created before resource discovery do not have a skill-specific rubric. Create a new path from a resource search to use the new assessment flow.

## API flow

Each operation that starts work returns `workflow_id`. Poll `GET /api/workflows/{workflow_id}` until completed or failed; successful workflow outputs are in `result`.

1. `POST /api/profiles/resume` with multipart field `file` (PDF or DOCX, at most 5 MB). Poll, then read `GET /api/profiles/{profile_id}` and submit edits to `POST /api/profiles/{profile_id}/confirm` with `{"skills": [...]}`. Poll confirmation before searching.
2. `POST /api/jobs/search` with `{"profile_id": "...", "role": "AI software engineer", "location": "California", "seniority": "senior"}`. Poll and read `GET /api/analyses/{analysis_id}`. Gaps are skills not evidenced by the confirmed profile; their source excerpts and job URLs are retained. Job search ranking and availability are not guarantees of current openings.
3. `POST /api/resources/search` with `{"analysis_id": "...", "skill": "..."}`, selecting a gap from that analysis. Poll and read `GET /api/resource-searches/{resource_search_id}`. The result contains up to five free and five paid resources, with cost excerpts and retrieval times. Cost categories are model interpretations of page text, so users should check prices and access terms on the source page.
4. `POST /api/learning-paths` with `{"profile_id": "...", "resource_search_id": "...", "goal": "..."}`. At least one free resource is required. Poll, then read `GET /api/learning-paths/{path_id}`. Every milestone references a URL from that free resource set; paid resources are excluded from path construction.
5. Review the proposed rubric. To change the goal and regenerate its draft, `POST /api/learning-paths/{path_id}/revisions` with `{"goal": "..."}`. Approve the displayed version with `POST /api/learning-paths/{path_id}/approve` and `{"revision": 1}` (use the current revision). Approval freezes the rubric. Ask the coach with `POST /api/learning-paths/{path_id}/coach` and `{"question": "..."}`.
6. `POST /api/learning-paths/{path_id}/assessments/prepare` starts preparation against the approved rubric. Poll for `assessment_set_id`, then read `GET /api/assessment-sets/{assessment_set_id}`. The response excludes answer keys.
7. Submit `POST /api/learning-paths/{path_id}/assessments` with `{"assessment_set_id": "...", "answers": {"question_id": "selected option"}, "project_response": "..."}`. Poll, then read `GET /api/assessments/{attempt_id}`. The knowledge check is scored against the stored answers; the project is model-reviewed against the frozen criteria. Results include source excerpts from the submission, criterion feedback, and remediation on failure. Three unsuccessful attempts stop further automatic retries.

The assessment is a knowledge check and written exercise, with an LLM reviewer for the project. It is not a reproducible execution test or a professional certification. Generated questions and grading can be wrong and should be reviewed; assessment data and answer keys are stored in the local database. No secure exam environment is provided.

Search and fetch results are external and can be stale, inaccessible, incomplete, or prompt-injected. The agent verifies that excerpts appear in the retrieved page, but this does not prove that the page is trustworthy, a job remains open, or a price is current. A zero-result or unavailable provider does not create invented findings.
