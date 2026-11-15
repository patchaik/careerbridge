import { isReal } from "./endpoints";
import type { ProgressMilestone } from "../types";
import { mockGetProgress } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: the contract's GET /api/progress returns {goal, gaps, verified_evidence,
// next_action} -- a different shape from this flat ProgressMilestone[] mock
// type. No page calls this yet (Phase 4+ /progress); needs a real mapping
// pass when that page is built. See docs/INTEGRATION_NOTES.md.
export async function getProgress(): Promise<ProgressMilestone[]> {
  if (!isReal("getProgress")) return mockGetProgress();
  return apiRequest<ProgressMilestone[]>("/api/progress");
}
