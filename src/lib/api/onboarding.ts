import { USE_MOCKS } from "../config";
import { mockCreateProfile, mockParseResume, type CreateProfileInput } from "../mock/handlers";
import { apiRequest } from "./client";

// Extracts skills from an uploaded résumé only — StartPage merges the result
// into its own skills list rather than this call producing a full profile.
export async function parseResume(
  file: File,
  simulateFailure = false,
): Promise<{ workflowId: string }> {
  if (USE_MOCKS) return { workflowId: mockParseResume(simulateFailure) };
  // Real backend: multipart upload, see docs/API_CONTRACT.md for POST /onboarding/parse
  const body = new FormData();
  body.append("file", file);
  return apiRequest<{ workflowId: string }>("/onboarding/parse", { method: "POST", body });
}

export type { CreateProfileInput };

export async function createProfile(input: CreateProfileInput): Promise<{ workflowId: string }> {
  if (USE_MOCKS) return { workflowId: mockCreateProfile(input) };
  return apiRequest<{ workflowId: string }>("/profiles", { method: "POST", body: input });
}
