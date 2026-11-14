import { USE_MOCKS } from "../config";
import type { ProgressMilestone } from "../types";
import { mockGetProgress } from "../mock/handlers";
import { apiRequest } from "./client";

export async function getProgress(): Promise<ProgressMilestone[]> {
  if (USE_MOCKS) return mockGetProgress();
  return apiRequest<ProgressMilestone[]>("/progress");
}
