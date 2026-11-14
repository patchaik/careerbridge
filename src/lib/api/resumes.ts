import { USE_MOCKS } from "../config";
import type { ResumeCritique, ResumeDraft } from "../types";
import { mockDraftResume, mockExportResume, mockGetResumeCritique } from "../mock/handlers";
import { apiRequest } from "./client";

export async function draftResume(assessmentAttemptId: string): Promise<ResumeDraft> {
  if (USE_MOCKS) return mockDraftResume();
  return apiRequest<ResumeDraft>("/resumes/draft", {
    method: "POST",
    body: { assessmentAttemptId },
  });
}

export async function exportResume(draft: ResumeDraft): Promise<{ success: true; filename: string }> {
  if (USE_MOCKS) return mockExportResume();
  return apiRequest<{ success: true; filename: string }>("/resumes/export", {
    method: "POST",
    body: draft,
  });
}

export async function critiqueResume(profileId: string): Promise<ResumeCritique> {
  if (USE_MOCKS) return mockGetResumeCritique();
  return apiRequest<ResumeCritique>("/resumes/critique", {
    method: "POST",
    body: { profileId },
  });
}
