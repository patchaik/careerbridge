// Mock implementations for every backend endpoint. Each returns fixture data
// after a short simulated delay. src/lib/api/*.ts calls these when USE_MOCKS is true.

import { mockDelay } from "../config";
import type {
  AssessmentAttempt,
  AuthSession,
  CandidateProfile,
  CandidateSkillEvidence,
  Interest,
  InterestAnalysis,
  KnowledgeCheckQuestion,
  LearningPath,
  LearningResource,
  ProgressMilestone,
  ResumeCritique,
  ResumeDraft,
  Situation,
  SkillAnalysis,
  TutorMessage,
  WellbeingCheckIn,
} from "../types";
import {
  demoInferredInterests,
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

// Extracts skills from an uploaded résumé — does not build a profile by
// itself. StartPage merges the result into its skills tag list.
export function mockParseResume(simulateFailure = false): string {
  return startMockWorkflow<{ skills: CandidateSkillEvidence[] }>(
    () => {
      if (simulateFailure) {
        throw new Error("We couldn't read that file. Try a different PDF/DOCX, or add your skills manually below.");
      }
      return { skills: demoResumeSkills };
    },
    [800, 1800],
  );
}

export interface BuildProfileInput {
  skills: CandidateSkillEvidence[];
  situation: Situation;
  profileId?: string;
}

// Builds the (not-yet-confirmed) profile from whatever StartPage has
// compiled: full skill evidence (résumé- and/or user-sourced, already
// carrying excerpts from mockParseResume) and the chosen situation.
// confirmedAt stays null here — only mockConfirmProfile sets it.
export function mockBuildProfile(input: BuildProfileInput): string {
  return startMockWorkflow<{ profile: CandidateProfile }>(
    () => ({
      profile: { ...demoProfile, skills: input.skills, situation: input.situation, confirmedAt: null },
    }),
    [500, 1100],
  );
}

// Finalizes the profile the user reviewed on /interests: applies removals,
// then the (possibly edited) skill list, and stamps confirmedAt. Mirrors the
// real PUT /api/profiles/{id}/confirm contract closely enough for the demo.
export async function mockConfirmProfile(
  profileId: string,
  skills: { skill: string; status: CandidateSkillEvidence["status"]; excerpt?: string | null }[],
  _removeSkillIds: string[],
): Promise<CandidateProfile> {
  await mockDelay(300, 700);
  const confirmedSkills: CandidateSkillEvidence[] = skills
    .map(({ skill, status, excerpt }) => {
      const fromResume = demoResumeSkills.find((s) => s.skill.toLowerCase() === skill.toLowerCase());
      return {
        id: fromResume?.id ?? `evidence_${skill.toLowerCase().replace(/\s+/g, "_")}`,
        skill,
        category: fromResume?.category ?? "technical",
        status,
        source: fromResume ? "resume" : "user",
        sourceExcerpt: excerpt ?? fromResume?.sourceExcerpt ?? null,
      };
    });
  return {
    ...demoProfile,
    id: profileId,
    skills: confirmedSkills,
    confirmedAt: new Date().toISOString(),
  };
}

export function mockGetWorkflow<T>(workflowId: string) {
  return getMockWorkflow<T>(workflowId);
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

export async function mockAnalyzeInterests(userInterests: string[]): Promise<InterestAnalysis> {
  await mockDelay(500, 1100);
  const userEntries: Interest[] = userInterests.map((label) => ({
    id: `interest_user_${label.toLowerCase().replace(/\s+/g, "_")}`,
    label,
    source: "user",
    sourceExcerpt: null,
  }));
  return { interests: [...userEntries, ...demoInferredInterests] };
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
