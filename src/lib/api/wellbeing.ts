import type { WellbeingCheckIn } from "../types";
import { mockWellbeingCheckIn } from "../mock/handlers";

// The real backend's POST /api/wellbeing/checkin returns 501 (P1, not
// implemented by the agents yet) — stays mock regardless of mode.
export async function submitCheckIn(pace: WellbeingCheckIn["pace"]): Promise<WellbeingCheckIn> {
  return mockWellbeingCheckIn(pace);
}
