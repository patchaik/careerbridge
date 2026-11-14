import { USE_MOCKS } from "../config";
import type { KnowledgeCheckQuestion } from "../types";
import { mockStartDiagnostic } from "../mock/handlers";
import { apiRequest } from "./client";

export async function startDiagnostic(skill: string): Promise<{ questions: KnowledgeCheckQuestion[] }> {
  if (USE_MOCKS) return mockStartDiagnostic();
  return apiRequest<{ questions: KnowledgeCheckQuestion[] }>("/diagnostics/start", {
    method: "POST",
    body: { skill },
  });
}
