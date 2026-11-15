import { apiRequest } from "./client";
import type { LearningPlan } from "./paths";
import type { LearningCheck } from "./learningChecks";

export interface ProgressPlan {
  path_id: string;
  goal_id: string;
  skill: string;
  objective: string;
  status: LearningPlan["status"];
  progress: LearningPlan["progress"];
  check_status: LearningCheck["status"] | "not_started";
  check_result: { quiz_score: number; quiz_total: number; criteria_met: number; criteria_total: number; submitted_at: string } | null;
  revisit: { milestone_id: string; title: string; reasons: string[] }[];
}
export interface Progress {
  goal: { id: string; target_role: string } | null;
  summary: {
    plans_total: number; plans_accepted: number; plans_completed: number;
    milestones_completed: number; milestones_total: number;
    checks_completed: number; plans_to_revisit: number;
  };
  plans: ProgressPlan[];
  recommendations: { kind: string; title: string; reason: string; href: string; path_id: string | null; skill: string | null }[];
  plan_limit: number;
  independently_verified: false;
}
export function getProgress() {
  return apiRequest<Progress>("/api/progress");
}
