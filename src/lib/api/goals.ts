import { isReal } from "./endpoints";
import { mockCreateGoal } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: this input shape (location/level/workMode) predates the real
// contract and doesn't line up with it (workMode here means remote/hybrid/
// onsite; the contract's `modality` means text/hands_on/both learning
// preference — a different concept, not a renaming). No page calls this yet
// (Phase 4+). Flagged in docs/INTEGRATION_NOTES.md for when /target is built.
export interface CreateGoalInput {
  targetRole: string;
  location: string | null;
  level: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
}

export async function createGoal(input: CreateGoalInput): Promise<{ goalId: string }> {
  if (!isReal("createGoal")) return mockCreateGoal();
  const goal = await apiRequest<{ id: string }>("/api/goals", {
    method: "POST",
    body: { target_role: input.targetRole, location: input.location, seniority: input.level },
  });
  return { goalId: goal.id };
}
