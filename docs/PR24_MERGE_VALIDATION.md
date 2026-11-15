# PR #24 final integration checks

Validated the combined tree of PR head `01185fabbed5ae7e367150a926a0b88fbad0ef2a` and `stitch-1` head `1aac9d6ff5a6d7732a0d42f162b33bd3b54a2ad0` on 2026-11-14. The seven upstream UI/auth files did not overlap PR changes; their GitHub blob hashes were retained exactly.

| Check | Result |
| --- | --- |
| Python suite, including real PostgreSQL integration | 70 passed; zero skipped |
| Disposable PostgreSQL 17 lifecycle | Started on a loopback-only ephemeral port; stopped/removed after tests |
| Contract checks | 814 passed |
| Targeted Python lint | Passed |
| TypeScript and Vite production build | Passed |
| ESLint | Zero errors, four existing Fast Refresh warnings |
| Live OpenAI résumé upload | HTTP 201; SQL, Python and Docker extracted |
| Profile confirmation, reload and same-key replay | HTTP 200; exact excerpts and evidence IDs retained; no duplicate workflow |
| Supabase storage and provenance | Uploaded bytes matched stored file; confirmation timestamp and successful OpenAI invocation linkage verified |
| Synthetic test data | Account, profile and uploaded file cleaned up |
| Local app availability | UI and Supabase-backed health endpoint available |

The live test used the running HTTP server and the same payload sent by the UI. An isolated headless browser could not launch because macOS denied its process bootstrap; no sign-up/upload browser automation result is claimed. The signup screen rendered through the supported in-app browser. These environment limitations are separate from the passing application tests.

No hosted schema migration or deployment to `main` was performed. JWT authentication, canonical durable workflows and restart-safe idempotency remain explicit follow-up work. The newer auth fix prevents a silent fake session on backend-registration failure; it is not a replacement for Supabase JWT authentication. Existing development-tool dependency advisories are unchanged.
