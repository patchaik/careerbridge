# CareerBridge API Contract

This is the contract the FastAPI backend should implement. The frontend currently
runs entirely on mock data (`VITE_USE_MOCKS=true`); when a real endpoint is ready,
only `src/lib/api/*.ts` needs to change to point at it (set `VITE_USE_MOCKS=false`).

**Conventions**

- Base URL comes from `VITE_API_BASE_URL` (frontend) — e.g. `http://localhost:8000`.
- All request/response bodies are JSON with **snake_case** field names (matching
  Pydantic defaults). The frontend converts to camelCase at the `src/lib/api/`
  boundary — see `src/lib/types.ts` for the camelCase shapes these map to.
- FastAPI must allow CORS from `http://localhost:3002` (the frontend's dev port).
- Async operations (parsing, job search) return a `workflow_id` immediately and
  are polled via `GET /workflows/{workflow_id}` until `status` is `complete` or
  `failed`.
- Error responses: any non-2xx returns `{ "message": string }`. The frontend
  wraps this in an `ApiError` with the HTTP status attached.
- This file must be kept in sync whenever a type in `src/lib/types.ts` changes.

---

## POST /onboarding/parse

Extract résumé or manual skill evidence. Async — returns a workflow id.

**Request** (résumé upload — multipart/form-data)
```
file: <PDF or DOCX binary>
```

**Request** (manual skill entry — JSON)
```json
{ "skills": ["Java", "Spring Boot", "REST APIs", "Oracle", "Docker"] }
```

**Response**
```json
{ "workflow_id": "wf_123" }
```

Poll `GET /workflows/wf_123` until complete; the resolved result is:
```json
{
  "profile": {
    "id": "profile_demo_1",
    "target_role": "Software Engineer — AI Applications",
    "location": "Remote",
    "level": "Mid-level",
    "work_mode": "remote",
    "confirmed_at": null,
    "skills": [
      {
        "skill": "Java",
        "category": "technical",
        "status": "present",
        "source_excerpt": "5 years building backend services in Java across two teams."
      }
    ]
  }
}
```

**Errors**: `422` if the file isn't a parseable PDF/DOCX — frontend falls back to manual entry, never invents a profile.

---

## PUT /profiles/{profile_id}/confirm

Approve the (possibly edited) extracted profile.

**Request**: full `CandidateProfile` object (snake_case), as above.

**Response**: the same object with `confirmed_at` set.

**Errors**: `404` if `profile_id` doesn't exist.

---

## POST /goals

Create the target role + preferences.

**Request**
```json
{
  "target_role": "Software Engineer — AI Applications",
  "location": "Remote",
  "level": "Mid-level",
  "work_mode": "remote"
}
```

**Response**
```json
{ "goal_id": "goal_demo_1" }
```

---

## POST /jobs/search

Fetch job postings matching the goal. Async — returns a workflow id, same polling pattern as `/onboarding/parse`.

**Request**: `{}` (uses the most recently created goal) or `{ "goal_id": "goal_demo_1" }`.

**Response**: `{ "workflow_id": "wf_456" }`. Resolved result:
```json
{
  "postings": [
    {
      "id": "job_01",
      "title": "Software Engineer, AI Applications",
      "company": "Northwind Analytics",
      "provider": "Demo Job Feed (fixture)",
      "url": "https://example.com/jobs/job_01",
      "retrieved_at": "2026-11-10T09:00:00Z",
      "is_demo_fixture": true,
      "description_completeness": "complete"
    }
  ]
}
```

---

## POST /skills/analyze

Compare candidate evidence against aggregated job requirements; rank gaps.

**Request**: `{}` (uses the current profile + most recent job search).

**Response**
```json
{
  "provider": "Demo Job Feed (fixture)",
  "retrieved_at": "2026-11-10T09:00:00Z",
  "postings_analyzed": 10,
  "is_demo_data": true,
  "data_quality_warning": null,
  "your_skills": [
    { "skill": "Java", "category": "technical", "status": "present", "source_excerpt": "..." }
  ],
  "market_skills": [
    {
      "skill": "Retrieval-Augmented Generation (RAG)",
      "importance": "required",
      "postings_mentioning": { "count": 4, "job_ids": ["job_01", "job_03", "job_06", "job_09"] },
      "total_postings": 10,
      "candidate_evidence_status": "not_established"
    }
  ],
  "gaps": [
    {
      "skill": "Retrieval-Augmented Generation (RAG)",
      "postings_mentioning": { "count": 4, "job_ids": ["job_01", "job_03", "job_06", "job_09"] },
      "total_postings": 10,
      "candidate_evidence_status": "not_established",
      "next_action": "learn",
      "ranking_reason": "Required or preferred in 4 of 10 postings for this role.",
      "is_learnable_quickly": true,
      "barrier_explanation": null
    }
  ]
}
```

When the job-data provider is unreachable, return cached data with
`data_quality_warning` set, e.g. `"Provider unavailable — showing cached snapshot from 2026-11-08."`.
Never omit this field silently.

---

## POST /diagnostics/start

Optional baseline quiz for a "not established" gap — lets a candidate who
already has undocumented skill clarify that without penalty.

**Request**: `{ "skill": "Retrieval-Augmented Generation (RAG)" }`

**Response**
```json
{
  "questions": [
    {
      "id": "d1",
      "prompt": "What does the \"retrieval\" step in RAG primarily do?",
      "options": ["Generates the final answer text", "Finds relevant source passages for a query", "Trains the language model", "Formats the answer as JSON"]
    }
  ]
}
```
Note: `correct_option_index` is never sent to the client.

---

## POST /paths/generate

Build the learning path + frozen rubric for a chosen skill.

**Request**: `{ "skill": "Retrieval-Augmented Generation (RAG)" }`

**Response**
```json
{
  "id": "path_rag_beginner",
  "objective": "Beginner RAG: from basics to a working project",
  "skill": "Retrieval-Augmented Generation (RAG)",
  "status": "not_started",
  "milestones": [
    { "id": "m1", "order": 1, "title": "Retrieval vs. generation", "description": "...", "status": "in_progress" }
  ],
  "rubric_version": {
    "id": "rubric_rag_v1",
    "version": "v1.0",
    "frozen_at": "2026-11-09T00:00:00Z",
    "criteria": [
      { "id": "knowledge_check", "label": "Knowledge check score", "type": "knowledge_check", "threshold": "≥ 80%" },
      { "id": "no_invented_citations", "label": "No invented or fabricated citations", "type": "critical", "threshold": "Required" }
    ]
  }
}
```

The rubric returned here must be the exact rubric used to grade `/assessments/submit` for this skill — it is frozen at generation time and never silently changes.

---

## GET /resources?skill=Retrieval-Augmented%20Generation%20(RAG)

**Response**
```json
[
  {
    "id": "res_1",
    "title": "Retrieval-Augmented Generation, explained",
    "provider": "DeepLearning.AI",
    "url": "https://example.com/resources/rag-explained",
    "price_type": "free",
    "modality": "text",
    "verified_at": "2026-11-05T00:00:00Z"
  }
]
```

---

## POST /arena/tutor

Ask the tutor a question or request a hint for the current milestone. The tutor can explain and hint — it can never mark anything as mastered.

**Request**
```json
{ "question": "Why does it matter which passage I cite?", "milestone_id": "m3" }
```

**Response**
```json
{
  "id": "tutor_123",
  "role": "tutor",
  "content": "A good first check: can you point to the exact sentence that backs up each claim in the answer?",
  "created_at": "2026-11-11T10:05:00Z"
}
```

---

## POST /arena/practice

Record a practice attempt (not graded towards mastery).

**Request**
```json
{
  "milestone_id": "m3",
  "query_id": "p1",
  "selected_passage_ids": ["pa1"],
  "correct": true
}
```

**Response**
```json
{ "feedback": "Good — that passage directly supports the answer you gave." }
```

---

## POST /assessments/submit

Grade against the frozen rubric. This is the **only** path to verified mastery.

**Request**
```json
{
  "rubric_version_id": "rubric_rag_v1",
  "knowledge_check_answers": { "k1": 1, "k2": 1, "k3": 1, "k4": 1, "k5": 1 },
  "project_answers": {
    "a1": { "selected_passage_ids": ["aa1"], "is_unanswerable": false },
    "a2": { "selected_passage_ids": [], "is_unanswerable": true }
  }
}
```

**Response**
```json
{
  "id": "attempt_1",
  "rubric_version_id": "rubric_rag_v1",
  "knowledge_check_score": 100,
  "project_tests_passed": 4,
  "project_tests_total": 5,
  "critical_checks": [
    { "criterion_id": "valid_passage_support", "label": "Every answer is backed by a retrieved passage", "passed": true, "detail": "..." }
  ],
  "passed": true,
  "completed_at": "2026-11-12T15:30:00Z"
}
```

---

## GET /progress

**Response**
```json
[
  { "id": "pm1", "title": "Profile confirmed", "completed_at": "2026-11-10T09:10:00Z", "status": "complete" },
  { "id": "pm5", "title": "Résumé evidence approved", "completed_at": null, "status": "upcoming" }
]
```

---

## POST /resumes/draft

**Request**: `{ "assessment_attempt_id": "attempt_1" }`

**Response**
```json
{
  "id": "resume_draft_1",
  "before": ["Software Developer, Meridian Systems (2021–present) — Java, Spring Boot, REST APIs, Oracle, Docker."],
  "proposed_additions": [
    {
      "id": "addition_1",
      "section": "Projects & Practical Training",
      "text": "Built a prototype retrieval-grounded Q&A workflow with source references, verified through an independent beginner-RAG assessment (Rubric v1.0).",
      "evidence_attempt_id": "attempt_1"
    }
  ],
  "approved": false
}
```

Additions must always target `"Projects & Practical Training"` — never a job-experience section.

---

## POST /resumes/export

**Request**: the full `ResumeDraft`, with `approved: true`.

**Response**
```json
{ "success": true, "filename": "resume-updated.docx" }
```

**Errors**: `400` if `approved` is not `true`.

---

## POST /wellbeing/checkin

Opt-in only. Never affects scoring, ranking, or recommendations.

**Request**: `{ "pace": "a_bit_much" }` (one of `comfortable`, `a_bit_much`, `overwhelmed`)

**Response**
```json
{ "id": "checkin_1", "pace": "a_bit_much", "created_at": "2026-11-11T12:00:00Z" }
```

---

## GET /workflows/{workflow_id}

Polling endpoint for any async operation above.

**Response**
```json
{ "workflow_id": "wf_123", "status": "running", "result": null, "error": null }
```

`status` is one of `pending`, `running`, `complete`, `failed`. Once `complete`, `result` holds that endpoint's resolved payload (as documented above); if `failed`, `error` holds a message.
