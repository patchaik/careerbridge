import { isReal } from "./endpoints";
import { mockSearchJobs } from "../mock/handlers";
import { apiRequest } from "./client";
import { registerCompletedWorkflow } from "./realWorkflowCache";

// NOTE: the contract's POST /api/jobs/search requires `goal_id` and answers
// synchronously (200, not a real async job in mock mode) — this function
// predates that and takes no goal id. No page calls it yet (Phase 4+); see
// docs/INTEGRATION_NOTES.md.
export async function searchJobs(goalId?: string): Promise<{ workflowId: string }> {
  if (!isReal("searchJobs") || !goalId) return { workflowId: mockSearchJobs() };
  const result = await apiRequest<{ jobs: unknown[]; fallback_used: boolean }>("/api/jobs/search", {
    method: "POST",
    body: { goal_id: goalId },
  });
  return { workflowId: registerCompletedWorkflow({ postings: result.jobs }) };
}
