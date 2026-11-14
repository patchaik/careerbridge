import { USE_MOCKS } from "../config";
import { mockCreateGoal } from "../mock/handlers";
import { apiRequest } from "./client";

export interface CreateGoalInput {
  targetRole: string;
  location: string | null;
  level: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
}

export async function createGoal(input: CreateGoalInput): Promise<{ goalId: string }> {
  if (USE_MOCKS) return mockCreateGoal();
  return apiRequest<{ goalId: string }>("/goals", { method: "POST", body: input });
}
