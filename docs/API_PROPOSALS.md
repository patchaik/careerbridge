> **Legacy stitch integration:** New MVP work follows [contracts/v0.1](../contracts/v0.1/README.md). Read [reconciliation status](RECONCILIATION.md) for the current baseline and remaining JWT, workflow and deterministic assessment requirements. The behavior below is retained for prototype reference.

# API proposals

Endpoints the UI wants that aren't in `api/openapi.yaml`. These stay mock
(`src/lib/api/endpoints.ts`) until the team adds them to the contract and the
backend implements them. Don't add these to `openapi.yaml` yourself — that
file is the database/backend team's contract to change.

---

## Contract change: bearer token replaces X-User-Id

The bearer security scheme is now reflected in `api/openapi.yaml` by the live-job-search integration. The notes below describe the implementation and migration from the older header.

`openapi.yaml`'s `securitySchemes.userId` already says the `X-User-Id` header
"will later be replaced by a Supabase Auth bearer token, with no change to
request bodies" — that's now done on the implementation side. For whoever
next edits the contract itself:

- Every route that currently documents the `X-User-Id` header parameter
  should instead document `Authorization: Bearer <supabase-access-token>`.
  No request/response body changed.
- **`POST /api/users` is no longer called by the UI at all.** Sign-up now
  creates the user directly in Supabase Auth (`supabase.auth.signUp`); the
  app's `users` row is created lazily by the backend on the first
  authenticated request (`database.users.get_or_link_app_user`), with
  `id` = the Supabase Auth user's id. `POST /api/users` / `GET
  /api/users/{id}` / `DELETE /api/users/{id}` / `GET /api/users/{id}/export`
  still exist and work (used by `scripts/smoke_test.py` for admin/cleanup),
  just not from the frontend's sign-up flow anymore.
- The backend still accepts the old `X-User-Id` header as a dev/test
  fallback behind `AUTH_MODE=header` (default is `AUTH_MODE=supabase`) — see
  `docs/INTEGRATION_NOTES.md`. That's a backend-only escape hatch, not
  something to add back to the contract as a real auth option.

---

## POST /api/interests/analyze

**Page:** `/interests`
**Why:** combines the candidate's typed-in interests with ones inferred from
the résumé, each with an excerpt. No skill/interest taxonomy work like this
exists in the agents today.

**Request**
```json
{ "profile_id": "...", "user_interests": ["Building backend systems"] }
```

**Response**
```json
{
  "interests": [
    { "id": "...", "label": "Building backend systems", "source": "user", "source_excerpt": null },
    { "id": "...", "label": "API design for other teams", "source": "inferred", "source_excerpt": "Designed and documented REST APIs..." }
  ]
}
```

---

## POST /api/resumes/critique

**Page:** `/critique`
**Why:** section-by-section résumé feedback (Strength/Suggestion/Important),
distinct from the gap analysis. No reviewer agent for this exists today.

**Request**
```json
{ "profile_id": "..." }
```

**Response**
```json
{
  "items": [
    {
      "id": "...", "section": "Summary", "severity": "important",
      "finding": "No summary section found.",
      "rationale": "...", "suggested_rewrite": "..."
    }
  ]
}
```

---

## POST /api/roles/outlook

**Page:** `/target`
**Why:** automation-exposure and demand-trend signal for a target role, with
sources and (when exposure is high) adjacent-role suggestions. No market/
automation-trend agent exists today.

**Request**
```json
{ "goal_id": "...", "target_role": "Manual QA Tester" }
```

**Response**
```json
{
  "exposure": "high",
  "demand_trend": "declining",
  "explanation": "...",
  "sources": ["..."],
  "is_demo_data": true,
  "suggested_roles": ["QA Automation Engineer", "Software Engineer — AI Applications"]
}
```

---

## POST /api/roles/recommend

**Page:** `/recommendations`
**Why:** role suggestions ranked by skill overlap with the candidate's
confirmed profile, for "I'm not sure" onboarding. No role-matching agent
exists today — `/api/jobs/search` matches postings for an already-chosen
role, not candidate-to-role.

**Request**
```json
{ "profile_id": "..." }
```

**Response**
```json
{
  "roles": [
    { "title": "QA Automation Engineer", "overlap_skills": ["Java", "Docker"],
      "missing_skills": ["Selenium"], "why": "..." }
  ]
}
```

---

## GET /api/jobs/recommended

**Page:** `/jobs`
**Why:** postings the candidate is now ready for, after verified evidence —
different from `/api/jobs/search`, which matches a target role to open
positions before any gap has been closed.

**Request:** `?user_id=...&goal_id=...`

**Response**
```json
{ "jobs": [ /* JobPosting[] from api/openapi.yaml, filtered to skills the user now has */ ] }
```

---

## Not a new endpoint, but worth a contract decision: `situation`

`/start`'s "What best describes your situation?" (upskill / no_job /
new_career) has no home in `CandidateProfile` or `career_goals` today. It's
client-side/journey-state only in both mock and real mode right now. If the
team wants it to inform `/api/roles/outlook`'s tone (e.g. supportive copy for
`no_job`) server-side, it needs a field somewhere — `career_goals` seems like
the more natural owner than `candidate_profiles`, since it's about intent
for the CURRENT goal rather than a durable fact about the candidate. See
`docs/INTEGRATION_NOTES.md`'s open questions.
