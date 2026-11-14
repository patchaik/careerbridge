import { USE_MOCKS } from "../config";
import type { InterestAnalysis } from "../types";
import { mockAnalyzeInterests } from "../mock/handlers";
import { apiRequest } from "./client";

export async function analyzeInterests(profileId: string): Promise<InterestAnalysis> {
  if (USE_MOCKS) return mockAnalyzeInterests();
  return apiRequest<InterestAnalysis>("/interests/analyze", {
    method: "POST",
    body: { profileId },
  });
}
