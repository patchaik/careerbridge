> **Legacy contract:** New MVP implementation targets [contracts/v0.1](../contracts/v0.1/README.md), including `/api/v1` and JWT-derived identity. The specification below documents the earlier baseline and is retained for migration reference.

# CareerBridge API

`openapi.yaml` is the contract between the UI and the FastAPI backend (OpenAPI 3.1).
Build both sides against it; change the spec first, then the code.

## View it

- Paste `openapi.yaml` into https://editor.swagger.io for interactive docs.
- Or in VS Code, install the "OpenAPI (Swagger) Editor" extension and open the file.

## Conventions

| Topic | Rule |
| --- | --- |
| Auth (MVP) | `X-User-Id: <user uuid>` header on every call except `/api/health` and `POST /api/users` |
| Errors | `{"error": {"code", "message", "field"}}`; `message` is safe to show the user |
| Idempotency | `Idempotency-Key` header on profile confirm, assessment start/submit and résumé export |
| Long calls | Job search, gap analysis and path generation return a `workflow_id`; on `202`, poll `GET /api/workflows/{id}` |
| Provenance | Jobs, gaps and resources carry `provider`/`url`; the UI labels `cached` and `synthetic` data |
| Backend | Each operation lists the `database` functions it uses in `x-db-functions` |

Error codes map from the data layer: `DBError` "not found" → 404 `not_found`; a refused rule
(frozen rubric, export before approval, unverified evidence) → 409 `rule_violation`;
bad input → 422 `validation_error`.

## Endpoints

| Step | Method and path | Purpose |
| --- | --- | --- |
| Sign in | `POST /api/users` | Sign in or create by email (consent required) |
| | `DELETE /api/users/{id}` · `GET /api/users/{id}/export` | Delete or download my data |
| 1. Upload | `POST /api/onboarding/parse` | Résumé (multipart) or manual skills → profile |
| 2. Confirm | `GET /api/profiles/{id}` · `PUT /api/profiles/{id}/confirm` | Review and confirm skills |
| 3. Goal | `POST /api/goals` · `GET /api/goals` | Target role, location, seniority |
| 4. Jobs | `POST /api/jobs/search` · `GET /api/jobs/{id}` | Up to 5 real postings with requirements |
| 5. Gaps | `POST /api/skills/analyze` · `GET /api/gap-analyses/{id}` | Up to 10 gaps, each citing its jobs |
| 6. Path | `POST /api/paths/generate` · `PUT /api/paths/{id}/approve` · `PUT /api/paths/{id}/status` | Propose, approve (freezes rubric), pause |
| | `GET /api/resources?skill=` | Up to 5 free and 5 paid resources |
| 7. Learn | `POST /api/arena/tutor` · `POST /api/arena/practice` | Tutor and practice (P1) |
| 8. Assess | `POST /api/assessments/start` · `POST /api/assessments/submit` | Graded against the frozen rubric |
| | `GET /api/progress` | Gap status, evidence, next action |
| 9. Résumé | `POST /api/resumes/draft` · `PATCH /api/resumes/{id}` | Evidence-backed suggested edits |
| | `PUT /api/resumes/{id}/approve` · `PUT /api/resumes/{id}/reject` | User decision |
| | `POST /api/resumes/export` | DOCX/PDF download link, approved only |
| Optional | `POST /api/diagnostics/start` · `POST /api/diagnostics/{id}/submit` | Skip training if already skilled (P1) |
| | `PUT /api/wellbeing/preferences` · `POST /api/wellbeing/checkin` | Nonclinical check-in (P1) |
| System | `GET /api/health` · `GET /api/workflows/{id}` | Health and long-running status |

For the weekend demo, the P0 path is steps 1–6, 8 and 9.

