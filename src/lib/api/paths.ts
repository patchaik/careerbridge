import { apiRequest } from "./client";
import type { SavedResource } from "./resources";

export type Modality = "text" | "hands_on" | "both";
export interface PlanRequest {
  resource_search_id: string;
  learning_goal: string;
  modality: Modality;
  resource_ids: string[];
}
export interface LearningPlan {
  id: string;
  workflow_id: string;
  goal_id: string;
  resource_search_id: string;
  skill: string;
  objective: string;
  learning_outcome: string;
  modality: Modality;
  status: "proposed" | "approved" | "in_progress" | "paused" | "completed";
  progress: { completed: number; total: number; next_milestone_id: string | null };
  milestones: {
    id: string;
    done: boolean;
    title: string;
    mode: "text" | "hands_on";
    instruction: string;
    success_criteria: string[];
    resource_ids: string[];
  }[];
  resources: SavedResource[];
  rubric: null;
  assessment_available: false;
}
export function generatePath(body: PlanRequest) {
  return apiRequest<LearningPlan>("/api/paths/generate", {
    method: "POST",
    body,
  });
}
export function getPath(id: string) {
  return apiRequest<LearningPlan>(`/api/paths/${encodeURIComponent(id)}`);
}
export function listPaths() {
  return apiRequest<{ plans: LearningPlan[] }>("/api/paths");
}
export function completeMilestone(pathId: string, milestoneId: string, done: boolean) {
  return apiRequest<LearningPlan>(
    `/api/paths/${encodeURIComponent(pathId)}/milestones/${encodeURIComponent(milestoneId)}/completion`,
    { method: "PUT", body: { done } },
  );
}
export function approvePath(id: string) {
  return apiRequest<LearningPlan>(
    `/api/paths/${encodeURIComponent(id)}/approve`,
    { method: "PUT" },
  );
}
