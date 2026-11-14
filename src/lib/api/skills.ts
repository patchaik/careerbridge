import { USE_MOCKS } from "../config";
import type { SkillAnalysis } from "../types";
import { mockAnalyzeSkills } from "../mock/handlers";
import { apiRequest } from "./client";

export async function analyzeSkills(simulateProviderUnavailable = false): Promise<SkillAnalysis> {
  if (USE_MOCKS) return mockAnalyzeSkills(simulateProviderUnavailable);
  return apiRequest<SkillAnalysis>("/skills/analyze", { method: "POST", body: {} });
}
