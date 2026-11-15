import { isReal } from "./endpoints";
import type { LearningResource } from "../types";
import { mockGetResources } from "../mock/handlers";
import { apiRequest } from "./client";

// NOTE: the contract's GET /api/resources returns {skill, free: [...],
// paid: [...]} grouped by price, not a flat list. No page calls this yet
// (Phase 4+ /courses); needs a real mapping pass (flatten free+paid, or
// change the return type) when that page is built. See
// docs/INTEGRATION_NOTES.md.
export async function getResources(skill: string): Promise<LearningResource[]> {
  if (!isReal("listResources")) return mockGetResources();
  const result = await apiRequest<{ free: LearningResource[]; paid: LearningResource[] }>(
    `/api/resources?skill=${encodeURIComponent(skill)}`,
  );
  return [...result.free, ...result.paid];
}
