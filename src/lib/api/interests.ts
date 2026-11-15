import type { InterestAnalysis } from "../types";
import { mockAnalyzeInterests } from "../mock/handlers";

// No /interests/analyze endpoint exists in api/openapi.yaml — see
// docs/API_PROPOSALS.md. Stays mock regardless of mode.
export async function analyzeInterests(
  _profileId: string,
  userInterests: string[],
): Promise<InterestAnalysis> {
  return mockAnalyzeInterests(userInterests);
}
