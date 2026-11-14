import { USE_MOCKS } from "../config";
import type { WellbeingCheckIn } from "../types";
import { mockWellbeingCheckIn } from "../mock/handlers";
import { apiRequest } from "./client";

export async function submitCheckIn(pace: WellbeingCheckIn["pace"]): Promise<WellbeingCheckIn> {
  if (USE_MOCKS) return mockWellbeingCheckIn(pace);
  return apiRequest<WellbeingCheckIn>("/wellbeing/checkin", { method: "POST", body: { pace } });
}
