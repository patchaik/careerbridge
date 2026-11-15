// Per-endpoint real|mock switch. VITE_USE_MOCKS=true forces everything to
// mock regardless of this table (see isReal below) — flip individual
// endpoints to "real" here as the backend grows past what stitch-1 wired up.
//
// "real" = the Python backend (careerbridge/main.py) implements this route
// against api/openapi.yaml. "mock" = no contract endpoint exists yet (see
// docs/API_PROPOSALS.md) or the agents don't support it (résumé drafts/
// export, diagnostics, wellbeing) — these stay mock regardless of mode.

import { USE_MOCKS } from "../config";

export type EndpointMode = "real" | "mock";

const ENDPOINT_MODE: Record<string, EndpointMode> = {
  // Users / auth
  createUser: "real",

  // Onboarding / profile
  parseOnboarding: "real",
  getProfile: "real",
  confirmProfile: "real",

  // Goals
  createGoal: "real",
  listGoals: "real",

  // Market evidence
  searchJobs: "real",
  getJob: "real",
  analyzeSkills: "real",
  getGapAnalysis: "real",

  // Learning
  generatePath: "real",
  getPath: "real",
  approvePath: "real",
  setPathStatus: "real",
  listResources: "real",

  // Arena
  tutor: "real",

  // Assessments
  startAssessment: "real",
  submitAssessment: "real",
  getProgress: "real",

  // No contract endpoint yet (docs/API_PROPOSALS.md) — stay mock
  analyzeInterests: "mock",
  critiqueResume: "mock",
  roleOutlook: "mock",
  roleRecommendations: "mock",
  recommendedJobs: "mock",

  // Agents don't support these yet — backend returns 501, UI stays mock
  practice: "mock",
  draftResume: "mock",
  exportResume: "mock",
  startDiagnostic: "mock",
  wellbeingCheckIn: "mock",

  // UI-only for now (password/username auth) — see docs/INTEGRATION_NOTES.md
  signIn: "mock",
  signUp: "mock",
  forgotPassword: "mock",
};

export function isReal(endpoint: keyof typeof ENDPOINT_MODE): boolean {
  if (USE_MOCKS) return false;
  return ENDPOINT_MODE[endpoint] === "real";
}
