import { apiRequest } from "./client";

export interface GapAnalysis {
  id: string;
  goal_id: string;
  profile_id: string;
  job_ids: string[];
  existing_skills: string[];
  market_skills: string[];
  gaps: {
    skill: string;
    importance: "required" | "preferred" | null;
    frequency: number | null;
    reason: string | null;
    job_ids: string[];
    sources: { job_id: string; title: string; url: string; provider: string; excerpt: string | null }[];
  }[];
}

export function analyzeSkills(
  goalId: string,
  profileId: string,
  jobIds: string[],
) {
  return apiRequest<GapAnalysis>("/api/skills/analyze", {
    method: "POST",
    body: { goal_id: goalId, profile_id: profileId, job_ids: jobIds },
  });
}

export function getGapAnalysis(id: string) {
  return apiRequest<GapAnalysis>(`/api/gap-analyses/${encodeURIComponent(id)}`);
}
