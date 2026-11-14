import { USE_MOCKS } from "../config";
import type { CandidateProfile } from "../types";
import { mockConfirmProfile, mockParseManualSkills, mockParseResume } from "../mock/handlers";
import { apiRequest } from "./client";

export async function parseResume(file: File): Promise<{ workflowId: string }> {
  if (USE_MOCKS) return { workflowId: mockParseResume() };
  // Real backend: multipart upload, see docs/API_CONTRACT.md for POST /onboarding/parse
  const body = new FormData();
  body.append("file", file);
  return apiRequest<{ workflowId: string }>("/onboarding/parse", { method: "POST", body });
}

export async function parseManualSkills(skills: string[]): Promise<{ workflowId: string }> {
  if (USE_MOCKS) return { workflowId: mockParseManualSkills(skills) };
  return apiRequest<{ workflowId: string }>("/onboarding/parse", {
    method: "POST",
    body: { skills },
  });
}

export async function confirmProfile(profile: CandidateProfile): Promise<CandidateProfile> {
  if (USE_MOCKS) return mockConfirmProfile(profile);
  return apiRequest<CandidateProfile>(`/profiles/${profile.id}/confirm`, {
    method: "PUT",
    body: profile,
  });
}
