// Simulates the backend's "start -> workflowId -> poll status" pattern for
// async operations (résumé parsing, job search) entirely in memory.

import { mockDelay } from "../config";
import type { Workflow } from "../types";

const workflows = new Map<string, Workflow>();
let counter = 0;

export function startMockWorkflow<T>(resultFactory: () => T, delayMs?: [number, number]): string {
  const workflowId = `wf_${++counter}`;
  workflows.set(workflowId, { workflowId, status: "pending", result: null, error: null });

  (async () => {
    workflows.set(workflowId, { workflowId, status: "running", result: null, error: null });
    await mockDelay(...(delayMs ?? [600, 1800]));
    try {
      const result = resultFactory();
      workflows.set(workflowId, { workflowId, status: "complete", result, error: null });
    } catch (err) {
      workflows.set(workflowId, {
        workflowId,
        status: "failed",
        result: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  })();

  return workflowId;
}

export function getMockWorkflow<T>(workflowId: string): Workflow<T> {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return { workflowId, status: "failed", result: null, error: "Unknown workflow id" };
  }
  return workflow as Workflow<T>;
}
