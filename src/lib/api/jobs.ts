import { isReal } from "./endpoints";
import { apiRequest, ApiError } from "./client";

export interface JobPosting {
  id: string;
  title: string;
  company: string | null;
  url: string;
  source: string;
  retrieved_at: string;
  completeness: "full" | "partial";
  requirements: {
    skill: string;
    importance: "required" | "preferred";
    excerpt: string;
  }[];
}

export async function searchJobs(goalId: string) {
  if (!isReal("searchJobs"))
    throw new ApiError(503, "Live job search requires the connected backend.");
  return apiRequest<{
    workflow_id: string;
    jobs: JobPosting[];
    source: string;
    fallback_used: boolean;
  }>("/api/jobs/search", {
    method: "POST",
    body: { goal_id: goalId, limit: 5 },
  });
}

export function getJob(id: string) {
  return apiRequest<JobPosting>(`/api/jobs/${encodeURIComponent(id)}`);
}
