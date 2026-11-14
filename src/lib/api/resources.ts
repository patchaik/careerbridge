import { USE_MOCKS } from "../config";
import type { LearningResource } from "../types";
import { mockGetResources } from "../mock/handlers";
import { apiRequest } from "./client";

export async function getResources(skill: string): Promise<LearningResource[]> {
  if (USE_MOCKS) return mockGetResources();
  return apiRequest<LearningResource[]>(`/resources?skill=${encodeURIComponent(skill)}`);
}
