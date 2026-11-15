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

**Page:** `/target` — shown after a role is entered, before the real job
search runs (the user can "Keep my target role" to proceed with the search,
or pick a recommended role, which swaps the target and re-runs this
outlook/search for it).
**Why:** automation-exposure and demand-trend signal for a target role,
framed as a signal, never a prediction — with risks, what stays human,
2-4 recommended adjacent roles, and suggestions. No market/automation-trend
agent exists today. Currently implemented client-side only
(`src/lib/mock/roleOutlook.ts`, a small static role knowledge base + skill-
overlap math against the confirmed profile — no model call).

**Request**
```json
{
  "target_role": "AI Developer",
  "profile_id": "...",
  "situation": "upskill",
  "experience_level": "intermediate",
  "years_of_experience": 3
}
```
`situation`/`experience_level`/`years_of_experience` tailor the summary's
framing (supportive for `no_job`, growth-oriented for `upskill`, exploratory
for `new_career`) — see the `situation`/`experience_level` proposals above
for why these aren't on `candidate_profiles` yet.

**Response**
```json
{
  "target_role": "AI Developer",
  "exposure": "medium",
  "demand_trend": "growing",
  "summary": "AI Developer currently shows medium automation exposure and growing demand. Since you're looking to grow where you are, this outlook is about strengthening your position, not necessarily changing roles.",
  "risks": [
    { "id": "risk-partial", "label": "Some tasks are being automated, not the whole role", "severity": "medium",
      "detail": "Parts of AI Developer work (repetitive analysis, first-draft output) are increasingly AI-assisted, while judgment-heavy parts aren't." }
  ],
  "what_stays_human": [
    "Judgment calls in ambiguous or high-stakes situations",
    "Stakeholder communication, negotiation, and trust-building"
  ],
  "recommended_roles": [
    { "role": "Ml Engineer", "why": "6 of 7 typical skills for this role already show up in your profile.",
      "skill_overlap": { "matched": 6, "total": 7 }, "outlook": "low", "demand_trend": "growing" }
  ],
  "suggestions": [
    "Lean into the judgment-heavy, cross-functional parts of the role — they're the hardest to automate."
  ],
  "sources": ["Bureau of Labor Statistics Occupational Outlook Handbook", "World Economic Forum Future of Jobs Report"],
  "is_demo_data": true
}
```

---

## POST /api/roles/recommend

**Page:** `/recommendations` ("I'm not sure, recommend roles for me")
**Why:** role suggestions ranked by skill overlap with the candidate's
confirmed profile, for "I'm not sure" onboarding. No role-matching agent
exists today — `/api/jobs/search` matches postings for an already-chosen
role, not candidate-to-role. Deliberately has no "% chance of getting
hired" framing. Currently implemented client-side only
(`src/lib/mock/roleOutlook.ts`'s `generateRoleRecommendations`), ranking a
small static role knowledge base by skill overlap against the profile.

**Request**
```json
{ "profile_id": "...", "situation": "new_career" }
```

**Response**
```json
{
  "roles": [
    {
      "role": "Qa Automation Engineer",
      "why": "4 of 6 skills transfer directly from your profile.",
      "skill_overlap": { "matched": 4, "total": 6 },
      "transferable_skills": ["Python", "Git", "Test Planning"],
      "skills_to_learn": ["Test Automation", "CI/CD"],
      "outlook": "low",
      "demand_trend": "growing"
    }
  ]
}
```
Selecting a role (`POST /api/goals` with it as `target_role`) is a
client-side action today — see `setTargetRole`/navigation to `/target` in
`src/pages/RecommendationsPage.tsx`.

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

---

## Not a new endpoint: `experience_level`, `years_of_experience`

`/start`'s new "What's your experience level?" (beginner/intermediate/
expert) and "How many years of experience do you have?" (0-50) questions
have no home in `CandidateProfile` either — same situation as `situation`
above. Right now `experienceLevel`/`yearsOfExperience` are journey-state
only (`src/context/JourneyContext.tsx`, persisted client-side), carried
through `buildProfile` into the client's `CandidateProfile` object but never
sent to `POST /api/onboarding/parse` or `PUT /api/profiles/{id}/confirm`.

Unlike `situation`, these feel more like a durable fact about the candidate
than intent for the current goal, so `candidate_profiles` (one row per
résumé/profile) seems like the more natural owner if the team wants them
persisted server-side — as two plain columns:
- `experience_level` — `text check (experience_level in ('beginner',
  'intermediate', 'expert'))`, nullable
- `years_of_experience` — `smallint check (years_of_experience between 0
  and 50)`, nullable

Both would round-trip through `GET /api/profiles/{id}` and `PUT
/api/profiles/{id}/confirm`'s existing response shape with no other schema
changes.
