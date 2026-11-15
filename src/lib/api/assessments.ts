import { isReal } from "./endpoints";
import type { AssessmentAttempt } from "../types";
import { mockSubmitAssessment } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: the contract's POST /api/assessments/submit takes {attempt_id,
// quiz_answers, project_submission} (an attempt must already exist via
// POST /api/assessments/start) and returns an AssessmentResult shape
// ({status, quiz_score, criteria, remediation, retries_left,
// verified_evidence_id}) -- meaningfully different from this
// AssessmentAttempt mock type. No page calls this yet (Phase 4+
// /assessment); needs a real mapping pass (and a start-assessment call
// added here) when that page is built. See docs/INTEGRATION_NOTES.md.
export interface SubmitAssessmentInput {
  rubricVersionId: string;
  knowledgeCheckAnswers: Record<string, number>;
  projectAnswers: Record<string, { selectedPassageIds: string[]; isUnanswerable: boolean }>;
}

export async function submitAssessment(input: SubmitAssessmentInput): Promise<AssessmentAttempt> {
  if (!isReal("submitAssessment")) return mockSubmitAssessment();
  return apiRequest<AssessmentAttempt>("/api/assessments/submit", {
    method: "POST",
    idempotencyKey: crypto.randomUUID(),
    body: input,
  });
}
