import { useEffect, useState } from "react";
import { getWorkflowStatus } from "../lib/api/workflows";
import type { Workflow } from "../lib/types";

const POLL_INTERVAL_MS = 500;

// Polls a backend workflow (start -> workflowId -> poll status) until it
// completes or fails. Pass the workflowId once you have it from the triggering call.
export function useWorkflowPolling<T>(workflowId: string | null) {
  const [workflow, setWorkflow] = useState<Workflow<T> | null>(null);

  useEffect(() => {
    if (!workflowId) return;
    const id = workflowId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const result = await getWorkflowStatus<T>(id);
      if (cancelled) return;
      setWorkflow(result);
      if (result.status === "pending" || result.status === "running") {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [workflowId]);

  return workflowId ? workflow : null;
}
