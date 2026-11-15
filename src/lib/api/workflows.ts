import { USE_MOCKS } from "../config";
import type { Workflow } from "../types";
import { mockGetWorkflow } from "../mock/handlers";
import { apiRequest } from "./client";
import { getLocalWorkflow } from "./realWorkflowCache";

export async function getWorkflowStatus<T>(workflowId: string): Promise<Workflow<T>> {
  const local = getLocalWorkflow<T>(workflowId);
  if (local) return local;
  if (USE_MOCKS) return mockGetWorkflow<T>(workflowId);
  return apiRequest<Workflow<T>>(`/api/workflows/${workflowId}`);
}
