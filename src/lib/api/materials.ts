import { apiRequest } from "./client";
import type { SavedResource } from "./resources";

export interface MilestoneMaterial {
  path_id: string;
  milestone_id: string;
  workflow_id: string;
  generated_at: string;
  content: {
    title: string;
    mode: "text" | "hands_on";
    learning_objective: string;
    sections: { heading: string; body: string }[];
    example: string;
    practice: { setup: string; steps: string[]; deliverable: string } | null;
    self_checks: { question: string; answer: string }[];
    resource_ids: string[];
  };
  resources: SavedResource[];
}
export function getMaterials(pathId: string) {
  return apiRequest<{ materials: MilestoneMaterial[] }>(
    `/api/paths/${encodeURIComponent(pathId)}/materials`,
  );
}
export function generateMaterial(pathId: string, milestoneId: string) {
  return apiRequest<MilestoneMaterial>(
    `/api/paths/${encodeURIComponent(pathId)}/milestones/${encodeURIComponent(milestoneId)}/material`,
    { method: "POST" },
  );
}
