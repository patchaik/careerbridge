import { USE_MOCKS } from "../config";
import type { LearningPath } from "../types";
import { mockGeneratePath } from "../mock/handlers";
import { apiRequest } from "./client";

export async function generatePath(skill: string): Promise<LearningPath> {
  if (USE_MOCKS) return mockGeneratePath();
  return apiRequest<LearningPath>("/paths/generate", { method: "POST", body: { skill } });
}
