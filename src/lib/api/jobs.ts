import { USE_MOCKS } from "../config";
import { mockSearchJobs } from "../mock/handlers";
import { apiRequest } from "./client";

export async function searchJobs(): Promise<{ workflowId: string }> {
  if (USE_MOCKS) return { workflowId: mockSearchJobs() };
  return apiRequest<{ workflowId: string }>("/jobs/search", { method: "POST", body: {} });
}
