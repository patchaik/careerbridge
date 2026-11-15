// api/openapi.yaml's onboarding/profile endpoints are synchronous (the real
// backend runs mock-mode agents in-process and answers immediately — see
// docs/INTEGRATION_NOTES.md), but the UI's upload/build flow is built around
// polling GET /workflows/{id} (useWorkflowPolling), so the demo can show
// real progress states against the mock layer's simulated delays.
//
// Rather than forking that UI code per mode, a real-mode call registers its
// already-known outcome here under a throwaway id, and src/lib/api/
// workflows.ts's getWorkflowStatus checks this cache first. The polling hook
// sees an already-"complete" (or "failed") workflow on its very first poll.

import type { Workflow } from "../types";

const cache = new Map<string, Workflow<unknown>>();

export function registerCompletedWorkflow<T>(result: T): string {
  const workflowId = `local_${crypto.randomUUID()}`;
  cache.set(workflowId, { workflowId, status: "complete", result, error: null });
  return workflowId;
}

export function registerFailedWorkflow(error: string): string {
  const workflowId = `local_${crypto.randomUUID()}`;
  cache.set(workflowId, { workflowId, status: "failed", result: null, error });
  return workflowId;
}

export function getLocalWorkflow<T>(workflowId: string): Workflow<T> | null {
  return (cache.get(workflowId) as Workflow<T> | undefined) ?? null;
}
