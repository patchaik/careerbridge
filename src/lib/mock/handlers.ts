// Mock implementations for every backend endpoint. Each returns fixture data
// after a short simulated delay. src/lib/api/*.ts calls these when USE_MOCKS is true.

import { mockDelay } from "../config";
import type {
  AssessmentAttempt,
  AuthSession,
  CandidateProfile,
  CandidateSkillEvidence,
  InterestAnalysis,
  KnowledgeCheckQuestion,
  LearningPath,
  LearningResource,
  ProgressMilestone,
  ResumeCritique,
  ResumeDraft,
  SkillAnalysis,
  TutorMessage,
  WellbeingCheckIn,
} from "../types";
import {
  demoInterestAnalysis,
  demoJobPostings,
  demoProfile,
  demoProgressMilestones,
  demoResumeCritique,
  demoResumeDraft,
  demoResumeSkills,
  demoSkillAnalysis,
  demoSkillAnalysisProviderUnavailable,
  diagnosticQuestions,
  passedAssessmentAttempt,
  ragKnowledgeCheck,
  ragLearningPath,
  ragProjectQuestionsAssessment,
  ragResources,
} from "./fixtures";
import { getMockWorkflow, startMockWorkflow } from "./workflow";

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "there";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "there";
}

export async function mockSignIn(email: string): Promise<AuthSession> {
  await mockDelay(400, 900);
  const fullName = nameFromEmail(email);
  return {
    user: { id: `user_${Date.now()}`, fullName, username: email.split("@")[0] ?? "user", email },
    token: `mock_token_${Date.now()}`,
  };
}

export async function mockSignUp(fields: {
  fullName: string;
  username: string;
  email: string;
}): Promise<AuthSession> {
  await mockDelay(500, 1000);
  return {
    user: { id: `user_${Date.now()}`, fullName: fields.fullName, username: fields.username, email: fields.email },
    token: `mock_token_${Date.now()}`,
  };
}

export async function mockForgotPassword(): Promise<{ success: true }> {
  await mockDelay(400, 800);
  return { success: true };
}

export function mockParseResume(simulateFailure = false): string {
  return startMockWorkflow<{ profile: CandidateProfile }>(
    () => {
      if (simulateFailure) {
        throw new Error("We couldn't read that file. Try a different PDF/DOCX, or enter your skills manually.");
      }
      return { profile: demoProfile };
    },
    [800, 1800],
  );
}

export function mockParseManualSkills(skills: string[]): string {
  const evidence: CandidateSkillEvidence[] = skills.map((skill) => ({
    skill,
    category: "technical",
    status: "self_reported",
    sourceExcerpt: null,
  }));
  return startMockWorkflow<{ profile: CandidateProfile }>(
    () => ({ profile: { ...demoProfile, skills: evidence } }),
    [400, 900],
  );
}

export function mockGetWorkflow<T>(workflowId: string) {
  return getMockWorkflow<T>(workflowId);
}

export async function mockConfirmProfile(profile: CandidateProfile): Promise<CandidateProfile> {
  await mockDelay();
  return { ...profile, confirmedAt: new Date().toISOString() };
}

export async function mockCreateGoal(): Promise<{ goalId: string }> {
  await mockDelay(200, 500);
  return { goalId: "goal_demo_1" };
}

export function mockSearchJobs(): string {
  return startMockWorkflow(() => ({ postings: demoJobPostings }), [800, 1600]);
}

export async function mockAnalyzeSkills(simulateProviderUnavailable = false): Promise<SkillAnalysis> {
  await mockDelay(500, 1200);
  return simulateProviderUnavailable ? demoSkillAnalysisProviderUnavailable : demoSkillAnalysis;
}

export async function mockStartDiagnostic(): Promise<{ questions: KnowledgeCheckQuestion[] }> {
  await mockDelay();
  return { questions: diagnosticQuestions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })) };
}

export async function mockGeneratePath(): Promise<LearningPath> {
  await mockDelay();
  return ragLearningPath;
}

export async function mockGetResources(): Promise<LearningResource[]> {
  await mockDelay(300, 700);
  return ragResources;
}

const tutorResponses = [
  "Think about what the retriever actually hands the model: a handful of passages. The answer should only say things those passages support.",
  "A good first check: can you point to the exact sentence that backs up each claim in the answer?",
  "If none of the retrieved passages mention it, the right move is to say the evidence doesn't cover that — not to guess.",
];
let tutorResponseIndex = 0;

export async function mockTutorMessage(question: string): Promise<TutorMessage> {
  await mockDelay(400, 1000);
  const content = question.trim()
    ? tutorResponses[tutorResponseIndex++ % tutorResponses.length]
    : "I can help with a hint, or answer a specific question about this milestone.";
  return {
    id: `tutor_${Date.now()}`,
    role: "tutor",
    content,
    createdAt: new Date().toISOString(),
  };
}

export async function mockRecordPractice(correct: boolean): Promise<{ feedback: string }> {
  await mockDelay(300, 700);
  return {
    feedback: correct
      ? "Good — that passage directly supports the answer you gave."
      : "Check again: does the passage you picked actually contain this information?",
  };
}

export async function mockSubmitAssessment(): Promise<AssessmentAttempt> {
  await mockDelay(800, 1600);
  return passedAssessmentAttempt;
}

export async function mockGetProgress(): Promise<ProgressMilestone[]> {
  await mockDelay(300, 600);
  return demoProgressMilestones;
}

export async function mockDraftResume(): Promise<ResumeDraft> {
  await mockDelay(400, 900);
  return demoResumeDraft;
}

export async function mockExportResume(): Promise<{ success: true; filename: string }> {
  await mockDelay(600, 1200);
  return { success: true, filename: "resume-updated.docx" };
}

export async function mockAnalyzeInterests(): Promise<InterestAnalysis> {
  await mockDelay(500, 1100);
  return demoInterestAnalysis;
}

export async function mockGetResumeCritique(): Promise<ResumeCritique> {
  await mockDelay(600, 1300);
  return demoResumeCritique;
}

export async function mockWellbeingCheckIn(
  pace: WellbeingCheckIn["pace"],
): Promise<WellbeingCheckIn> {
  await mockDelay(200, 500);
  return { id: `checkin_${Date.now()}`, pace, createdAt: new Date().toISOString() };
}

export { demoResumeSkills, ragKnowledgeCheck, ragProjectQuestionsAssessment };
