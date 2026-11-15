# Resource diagnostics and Langfuse

Resource discovery searches for free and paid options, fetches pages, extracts
structured resources with the shared model gateway, validates evidence, then saves
the catalog and an owned search snapshot. Evidence comparison accepts visible
Markdown link labels and inline formatting, but still rejects unsupported quotes,
duplicate/out-of-range pages and unsupported pricing. Prompt `learning-resources-v2`
aligns access labels with the validator. The existing single repair attempt receives
safe field/reason diagnostics; no resources are silently dropped to pass validation.

Failed workflows retain `diagnostics.stage`, `error_code`, `exception_type`, per-attempt
resource/page indexes and invalid field/reason pairs. Schema failures include the
schema path and validator, never the offending value. The UI receives a stage-specific
message and workflow reference in the existing error envelope. Raw source/model
content, credentials and exception messages are excluded from diagnostics.

## Setup

The backend uses **Langfuse Python SDK 5.2.0**. Set `LANGFUSE_PUBLIC_KEY`,
`LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` in the server's ignored `.env`, then
restart the API. Set `LANGFUSE_TRACING_ENABLED=false` to disable tracing. Missing
configuration disables tracing; telemetry errors do not fail application requests.
Never put these values in `VITE_` variables. `CAREERBRIDGE_ENV` labels traces.

This application has a custom HTTP model gateway, so a small manual integration
preserves both OpenAI and Nebius routing without replacing the transport or adding
LangChain callbacks that would capture learner inputs automatically.

- `discover-resources`: one root per discovery, linked to its workflow ID and stored
  `trace_id`, with skill/access input and result counts.
- `search-resources` / `fetch-resource-pages`: nested retrievers, with result counts.
- `run-resource_extract`: task span. Every provider attempt gets its own generation,
  with model/provider, token usage, latency, request ID, routing and prompt/schema versions.
- `validate-resource-evidence`: guardrail observations with exact field/reason diagnostics.
- `save-resources`: storage stage. Root timings distinguish search, fetch, model and save.
- Other shared-gateway tasks also get task spans and per-attempt generations.

User IDs are hashed. Inputs/outputs are deliberately reduced to safe summaries:
no resumes, learner goals, prompts, source pages, raw model responses or secrets are
exported. This limits content-based evaluation in Langfuse; use the versioned local
fixtures for detailed reproduction. Only application-created Langfuse spans are
exported. SDK exception auto-capture is avoided. The SDK batches exports; the API
flushes at shutdown and short scripts should call `careerbridge.tracing.flush()`.

## Verify

Refresh the local capability report after the prompt change:

```sh
python -m scripts.check_resource_model --profile openai
python -m scripts.check_discovery_flow --resources-only --skill PyTorch \
  --base-url http://127.0.0.1:8003 --output pytorch-check.json
```

The live check uses a disposable learner and seeded gap, then real Keenable search,
OpenAI extraction, evidence validation, Supabase catalog/snapshot persistence and GET
reload. It requires free and paid results, records stage timings/trace ID and cleans
the disposable learner. Shared public catalog resources remain.

Use the Langfuse CLI's `observations list --trace-id <id>` with
`--fields core,basic,io,metadata,model,usage,trace_context` to inspect the exported
trace. Confirm parent relationships, separate generation attempts, usage, environment,
safe diagnostic fields and saved counts. Use the current observations API rather
than deprecated trace-list endpoints.

References: [Langfuse skill](https://github.com/langfuse/skills/tree/main/skills/langfuse),
[trace best practices](https://langfuse.com/docs/observability/best-practices),
[Python instrumentation](https://langfuse.com/docs/observability/sdk/instrumentation).
