import { isReal } from "./endpoints";
import type { SkillAnalysis } from "../types";
import { mockAnalyzeSkills } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: the contract's POST /api/skills/analyze takes {goal_id, profile_id,
// job_ids} and returns a GapAnalysis shape ({existing_skills, market_skills,
// gaps: [{skill, importance, frequency, sources}]}) — meaningfully different
// from this SkillAnalysis mock type (yourSkills as full CandidateSkillEvidence
// objects, provider/retrievedAt framing). No page calls this yet (Phase 4+
// /skills); needs a real mapping pass when that page is built. See
// docs/INTEGRATION_NOTES.md.
export async function analyzeSkills(simulateProviderUnavailable = false): Promise<SkillAnalysis> {
  if (!isReal("analyzeSkills")) return mockAnalyzeSkills(simulateProviderUnavailable);
  return apiRequest<SkillAnalysis>("/api/skills/analyze", { method: "POST", body: {} });
}
