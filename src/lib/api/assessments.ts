import { USE_MOCKS } from "../config";
import type { AssessmentAttempt } from "../types";
import { mockSubmitAssessment } from "../mock/handlers";
import { apiRequest } from "./client";

export interface SubmitAssessmentInput {
  rubricVersionId: string;
  knowledgeCheckAnswers: Record<string, number>;
  projectAnswers: Record<string, { selectedPassageIds: string[]; isUnanswerable: boolean }>;
}

export async function submitAssessment(input: SubmitAssessmentInput): Promise<AssessmentAttempt> {
  if (USE_MOCKS) return mockSubmitAssessment();
  return apiRequest<AssessmentAttempt>("/assessments/submit", { method: "POST", body: input });
}
