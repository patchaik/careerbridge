import type { ResumeCritique, ResumeDraft } from "../types";
import { mockDraftResume, mockExportResume, mockGetResumeCritique } from "../mock/handlers";

// The real backend's résumé draft/export routes return 501 (the agents
// don't support it yet) and there's no /resumes/critique in the contract
// at all (see docs/API_PROPOSALS.md) — all three stay mock regardless of mode.
export async function draftResume(_assessmentAttemptId: string): Promise<ResumeDraft> {
  return mockDraftResume();
}

export async function exportResume(_draft: ResumeDraft): Promise<{ success: true; filename: string }> {
  return mockExportResume();
}

export async function critiqueResume(_profileId: string): Promise<ResumeCritique> {
  return mockGetResumeCritique();
}
