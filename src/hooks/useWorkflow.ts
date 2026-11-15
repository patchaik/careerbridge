import { useEffect, useState } from "react";
import { getWorkflowStatus } from "../lib/api/workflows";
import type { Workflow } from "../lib/types";

const POLL_INTERVAL_MS = 500;

// Polls a backend workflow (start -> workflowId -> poll status) until it
// completes or fails. Pass the workflowId once you have it from the triggering call.
export function useWorkflowPolling<T>(workflowId: string | null) {
  const [result, setResult] = useState<{ id: string; workflow: Workflow<T> } | null>(null);

  useEffect(() => {
    if (!workflowId) return;
    const id = workflowId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const workflow = await getWorkflowStatus<T>(id);
        if (cancelled) return;
        setResult({ id, workflow });
        if (workflow.status === "pending" || workflow.status === "running") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!cancelled) setResult({ id, workflow: { workflowId: id, status: "failed", result: null,
          error: error instanceof Error ? error.message : "Couldn't load progress. Please retry." } });
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [workflowId]);

  // Never expose the previous upload/build result while a new ID is loading.
  return result?.id === workflowId ? result.workflow : null;
}
