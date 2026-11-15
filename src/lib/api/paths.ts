import { isReal } from "./endpoints";
import type { LearningPath } from "../types";
import { mockGeneratePath } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: the contract's POST /api/paths/generate takes {goal_id, skill} (no
// goal id here yet) and its Milestone schema is {id,title,concepts,mode,done}
// — the coach agent's richer explanation/exercise/resource_urls per
// milestone isn't in the contract (meant to come from /api/arena/tutor
// instead). No page calls this yet (Phase 4+ /path); needs a real mapping
// pass when that page is built. See docs/INTEGRATION_NOTES.md.
export async function generatePath(skill: string): Promise<LearningPath> {
  if (!isReal("generatePath")) return mockGeneratePath();
  return apiRequest<LearningPath>("/api/paths/generate", { method: "POST", body: { skill } });
}
