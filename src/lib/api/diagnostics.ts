import type { KnowledgeCheckQuestion } from "../types";
import { mockStartDiagnostic } from "../mock/handlers";

// The real backend's POST /api/diagnostics/start returns 501 (P1, not
// implemented by the agents yet) — stays mock regardless of mode.
export async function startDiagnostic(_skill: string): Promise<{ questions: KnowledgeCheckQuestion[] }> {
  return mockStartDiagnostic();
}
