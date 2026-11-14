import { USE_MOCKS } from "../config";
import type { Workflow } from "../types";
import { mockGetWorkflow } from "../mock/handlers";
import { apiRequest } from "./client";

export async function getWorkflowStatus<T>(workflowId: string): Promise<Workflow<T>> {
  if (USE_MOCKS) return mockGetWorkflow<T>(workflowId);
  return apiRequest<Workflow<T>>(`/workflows/${workflowId}`);
}
