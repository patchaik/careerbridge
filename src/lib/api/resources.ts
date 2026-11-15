import { apiRequest } from "./client";

export type PriceType = "free" | "paid" | "mixed" | "unknown";
export interface SavedResource {
  id: string;
  title: string;
  url: string;
  price_type: PriceType;
  price_evidence: string;
  learning_evidence: string;
  format: string;
  checked_at: string;
}
export interface ResourceSearch {
  workflow_id: string;
  analysis_id: string;
  goal_id: string;
  skill: string;
  source: string;
  retrieved_at: string;
  free: SavedResource[];
  paid: SavedResource[];
  mixed: SavedResource[];
  unknown: SavedResource[];
}
export const priceLabels: Record<PriceType, string> = {
  free: "Free",
  paid: "Paid",
  mixed: "Free and paid tiers",
  unknown: "Price unknown",
};
export const priceTypes: PriceType[] = ["free", "paid", "mixed", "unknown"];
export function discoverResources(analysis_id: string, skill: string) {
  return apiRequest<ResourceSearch>("/api/resources/search", {
    method: "POST",
    body: { analysis_id, skill },
  });
}
export function getResourceSearch(id: string) {
  return apiRequest<ResourceSearch>(
    `/api/resource-searches/${encodeURIComponent(id)}`,
  );
}

// Retained for existing catalog consumers; the new flow uses saved search IDs.
export async function getResources(skill: string) {
  const result = await apiRequest<{
    free: SavedResource[];
    paid: SavedResource[];
  }>(`/api/resources?skill=${encodeURIComponent(skill)}`);
  return [...result.free, ...result.paid];
}
