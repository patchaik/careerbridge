import { isReal } from "./endpoints";
import { USE_MOCKS } from "../config";
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

// Job search has no frontend mock fallback — mock-ness lives on the backend
// (CAREERBRIDGE_SEARCH_MODE=mock returns synthetic postings); this call
// always hits the real endpoint. The isReal() check below only exists to
// fail clearly in pure demo mode (VITE_USE_MOCKS=true, where no backend is
// assumed to be running at all) instead of silently calling a backend that
// might not exist.
export async function searchJobs(goalId: string) {
  if (!isReal("searchJobs")) {
    throw new ApiError(
      503,
      USE_MOCKS
        ? "The app is running in demo mode (VITE_USE_MOCKS=true in .env). Set it to false and restart the dev server to use live job search against the real backend."
        : "Live job search requires the connected backend.",
    );
  }
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
