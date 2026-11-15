import { apiRequest } from "./client";

export interface CheckSubmission {
  quiz_answers: Record<string, number>;
  practice_response: string;
}
export interface LearningCheck {
  id: string;
  path_id: string;
  status: "new" | "generating" | "ready" | "grading" | "feedback_pending" | "completed";
  questions: { id: string; milestone_id: string; prompt: string; options: string[] }[];
  practice_prompt: string | null;
  criteria: { id: string; milestone_id: string; description: string }[];
  submission: CheckSubmission | null;
  independently_verified: false;
  result: {
    quiz_score: number;
    quiz_total: number;
    submitted_at: string;
    quiz: { question_id: string; milestone_id: string; selected_option: number; correct_option: number; correct: boolean; explanation: string }[];
    feedback: { summary: string; criteria: { criterion_id: string; met: boolean; evidence: string; feedback: string; next_step: string }[] };
  } | null;
}
export function getLearningCheck(pathId: string) {
  return apiRequest<{ check: LearningCheck | null }>(`/api/paths/${encodeURIComponent(pathId)}/learning-check`);
}
export function startLearningCheck(pathId: string) {
  return apiRequest<LearningCheck>(`/api/paths/${encodeURIComponent(pathId)}/learning-check`, { method: "POST" });
}
export function submitLearningCheck(id: string, body: CheckSubmission) {
  return apiRequest<LearningCheck>(`/api/learning-checks/${encodeURIComponent(id)}/submit`, { method: "POST", body });
}
