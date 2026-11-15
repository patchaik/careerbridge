# Résumé persistence and profile recovery

A successful upload saves a private résumé file, a `candidate_profiles` row and
`candidate_skill_evidence` rows. Confirmation updates that same profile's
`confirmed_at` and evidence statuses. These are the deployed stitch-1 tables;
the broader target-contract tables are not used by this flow.

## Failure and fix

The reported confirmation request named a missing profile ID even though newer
résumé profiles and files were saved. The frontend kept the new upload's profile ID
only in component state while preserving the filename and an older profile in
local storage. Refreshing or returning to onboarding could therefore reuse an
obsolete ID. The build step trusted that ID without reading the saved profile.
The workflow polling hook could also expose the previous completed result while a
new workflow ID was loading.

- Upload returns the authoritative saved profile immediately; the UI persists its
  identity, file state and evidence instead of relying on a session-only ID.
- Start and confirmation pages verify the cached profile with the authenticated
  backend. A missing cached ID recovers `GET /api/profiles/latest` for that user.
  A recovered draft must still be explicitly reviewed and confirmed by the learner.
- Network failures remain errors; they do not silently create replacement profiles.
  If no saved résumé exists, the UI offers re-upload/manual entry rather than a
  repeated failed confirmation or fabricated résumé evidence.
- Building reuses the saved profile and real file/evidence metadata. Local additions
  stay self-reported; cached excerpts cannot manufacture saved résumé evidence.
- Polling results are bound to their workflow ID. Default frontend mode is real;
  demo mode now requires explicit `VITE_USE_MOCKS=true`.
- Profile GET/latest/confirmation require authentication and ownership. Confirmation
  idempotency caches are scoped to user and profile and checked after ownership.

No migration or deletion of existing user profiles is required. Experience level,
years, situation and interests retain their existing client-only behavior; this fix
covers uploaded files, profile identity, skills/evidence and confirmation.

## Verification

93 Python tests passed; 14 isolated PostgreSQL tests skipped because their test
server was not configured. TypeScript/build and changed-file lint passed.

`scripts/check_profile_client.mjs` runs the actual TypeScript onboarding and HTTP
client modules against a live authenticated API (only the browser session lookup
is substituted). It checks upload, immediate saved identity, reload, stale-ID
recovery, build without duplication, confirmation and evidence-preserving reload.
Supply a disposable development/test session JSON, synthetic DOCX and output path.
The private session file contains an access token and must never be committed.

The live OpenAI/Supabase check passed. The private uploaded bytes matched exactly;
all extracted excerpts and confirmed statuses survived; one profile was created.
Only the disposable test identity, profile and file were removed after checking.
The existing user's saved résumés were not changed or deleted.
