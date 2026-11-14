import { USE_MOCKS } from "../config";
import type { TutorMessage } from "../types";
import { mockRecordPractice, mockTutorMessage } from "../mock/handlers";
import { apiRequest } from "./client";

export async function tutorMessage(question: string, milestoneId: string): Promise<TutorMessage> {
  if (USE_MOCKS) return mockTutorMessage(question);
  return apiRequest<TutorMessage>("/arena/tutor", {
    method: "POST",
    body: { question, milestoneId },
  });
}

export async function recordPractice(
  milestoneId: string,
  queryId: string,
  selectedPassageIds: string[],
  correct: boolean,
): Promise<{ feedback: string }> {
  if (USE_MOCKS) return mockRecordPractice(correct);
  return apiRequest<{ feedback: string }>("/arena/practice", {
    method: "POST",
    body: { milestoneId, queryId, selectedPassageIds, correct },
  });
}
