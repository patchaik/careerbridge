import { USE_MOCKS } from "../config";
import type { ResumeDraft } from "../types";
import { mockDraftResume, mockExportResume } from "../mock/handlers";
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
