import { isReal } from "./endpoints";
import type { TutorMessage } from "../types";
import { mockRecordPractice, mockTutorMessage } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: the contract's POST /api/arena/tutor takes {path_id, milestone_id,
// message} and returns {session_id, reply, hint_count} — this function
// predates path/milestone ids. No page calls this yet (Phase 4+ /arena);
// needs a real mapping pass when that page is built. See
// docs/INTEGRATION_NOTES.md.
export async function tutorMessage(question: string, milestoneId: string): Promise<TutorMessage> {
  if (!isReal("tutor")) return mockTutorMessage(question);
  return apiRequest<TutorMessage>("/api/arena/tutor", {
    method: "POST",
    body: { message: question, milestone_id: milestoneId },
  });
}

// POST /api/arena/practice returns 501 for now (the agents don't support
// it yet) — stays mock regardless of mode.
export async function recordPractice(
  _milestoneId: string,
  _queryId: string,
  _selectedPassageIds: string[],
  correct: boolean,
): Promise<{ feedback: string }> {
  return mockRecordPractice(correct);
}
