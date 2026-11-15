import { isReal } from "./endpoints";
import { mockCreateGoal } from "../mock/handlers";
import { apiRequest } from "./client";

export interface CreateGoalInput {
  targetRole: string;
  location: string | null;
  level: string | null;
}

export async function createGoal(input: CreateGoalInput): Promise<{ goalId: string }> {
  if (!isReal("createGoal")) return mockCreateGoal();
  const goal = await apiRequest<{ id: string }>("/api/goals", {
    method: "POST",
    body: { target_role: input.targetRole, location: input.location, seniority: input.level },
  });
  return { goalId: goal.id };
}
