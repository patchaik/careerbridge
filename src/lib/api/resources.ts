import { sourceUrl } from "../sourceUrl";
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
// Ignore advertising query parameters, but keep parameters that can identify
// a different course or lesson (for example, a video ID).
function resourceKey(resource: SavedResource) {
  const url = sourceUrl(resource.url);
  if (!url) return resource.id;
  const campaign = url.searchParams.has("campaignid") || url.searchParams.has("adgroupid");
  const tracking: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (/^(utm_.*|gclid|fbclid|msclkid)$/i.test(key) || (campaign &&
      /^(campaignid|adgroupid|assetgroupid|creativeid|device|devicemodel|extensionid|keyword|matchtype|network|placement|targetid)$/i.test(key))) {
      tracking.push(key);
    }
  });
  tracking.forEach(key => url.searchParams.delete(key));
  url.searchParams.sort();
  return url.href;
}

export function uniqueResources(search: ResourceSearch): ResourceSearch {
  const seen = new Set<string>();
  const result = { ...search };
  for (const kind of priceTypes) {
    result[kind] = search[kind].filter(resource => {
      const key = resourceKey(resource);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return result;
}

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
