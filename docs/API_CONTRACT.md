# API contract

This file used to be the UI's own invented contract. Superseded as of
`stitch-1`:

- **The real contract** is [`api/openapi.yaml`](../api/openapi.yaml), owned by
  the database/backend team. It's what `careerbridge/main.py` implements and
  what `src/lib/api/` calls when an endpoint is set to `"real"` in
  `src/lib/api/endpoints.ts`.
- **Endpoints the UI wants that aren't in the contract yet** are in
  [`API_PROPOSALS.md`](./API_PROPOSALS.md).
- **How it's wired up, what's real vs. mock vs. 501, and known gaps** are in
  [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md).
