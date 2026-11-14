// Core data model, mirroring the FastAPI backend's Pydantic schemas.
// JSON over the wire uses snake_case; src/lib/api/ converts to the camelCase shapes below.

// --- Auth (mock only — real auth comes from the backend later) ---

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
}

export type SkillCategory = "technical" | "interpersonal";

export type EvidenceStatus =
  | "present"
  | "user_confirmed"
  | "self_reported"
  | "not_established";

export interface CandidateSkillEvidence {
  skill: string;
  category: SkillCategory;
  status: EvidenceStatus;
  sourceExcerpt: string | null;
}

export interface CandidateProfile {
  id: string;
  targetRole: string | null;
  location: string | null;
  level: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  skills: CandidateSkillEvidence[];
  confirmedAt: string | null;
}

// --- /interests (POST /interests/analyze) ---

export type InterestCategory = "technical" | "interpersonal" | "domain";

export interface SkillCluster {
  id: string;
  category: InterestCategory;
  label: string;
  skills: string[];
  sourceExcerpt: string;
}

export interface InferredInterest {
  id: string;
  label: string;
  sourceExcerpt: string;
}

export interface InterestAnalysis {
  clusters: SkillCluster[];
  interests: InferredInterest[];
}

// --- /critique (POST /resumes/critique) ---

export type CritiqueSeverity = "strength" | "suggestion" | "important";
export type ResumeSection = "Summary" | "Experience" | "Skills" | "Projects" | "Formatting";

export interface CritiqueItem {
  id: string;
  section: ResumeSection;
  severity: CritiqueSeverity;
  finding: string;
  rationale: string;
  suggestedRewrite: string | null;
}

export interface ResumeCritique {
  items: CritiqueItem[];
}

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  provider: string;
  url: string;
  retrievedAt: string;
  isDemoFixture: boolean;
  descriptionCompleteness: "complete" | "partial" | "unavailable";
}

export type SkillImportance = "required" | "preferred";

export interface JobSkillRequirement {
  jobId: string;
  skill: string;
  importance: SkillImportance;
  sourceExcerpt: string;
}

export interface SkillGap {
  skill: string;
  postingsMentioning: {
    count: number;
    jobIds: string[];
  };
  totalPostings: number;
  candidateEvidenceStatus: EvidenceStatus | "mandatory_requirement_unmet";
  nextAction: "diagnostic" | "clarify" | "learn" | "none";
  rankingReason: string;
  isLearnableQuickly: boolean;
  barrierExplanation: string | null;
}

export interface MarketSkill {
  skill: string;
  importance: SkillImportance;
  postingsMentioning: {
    count: number;
    jobIds: string[];
  };
  totalPostings: number;
  candidateEvidenceStatus: EvidenceStatus;
}

export interface SkillAnalysis {
  provider: string;
  retrievedAt: string;
  postingsAnalyzed: number;
  isDemoData: boolean;
  dataQualityWarning: string | null;
  yourSkills: CandidateSkillEvidence[];
  marketSkills: MarketSkill[];
  gaps: SkillGap[];
}

export interface Milestone {
  id: string;
  order: number;
  title: string;
  description: string;
  status: "locked" | "in_progress" | "complete";
}

export interface RubricCriterion {
  id: string;
  label: string;
  type: "knowledge_check" | "project" | "critical";
  threshold: string;
}

export interface RubricVersion {
  id: string;
  version: string;
  criteria: RubricCriterion[];
  frozenAt: string;
}

export interface LearningPath {
  id: string;
  objective: string;
  skill: string;
  milestones: Milestone[];
  rubricVersion: RubricVersion;
  status: "not_started" | "in_progress" | "complete";
}

export type ResourcePriceType = "free" | "paid" | "mixed" | "unknown";

export interface LearningResource {
  id: string;
  title: string;
  provider: string;
  url: string;
  priceType: ResourcePriceType;
  modality: "video" | "text" | "interactive" | "course";
  verifiedAt: string;
}

export interface TutorMessage {
  id: string;
  role: "user" | "tutor";
  content: string;
  createdAt: string;
}

export interface PracticeAttempt {
  id: string;
  milestoneId: string;
  query: string;
  selectedPassageIds: string[];
  correct: boolean;
  feedback: string;
}

export interface KnowledgeCheckQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex?: number; // omitted from candidate-facing payloads before grading
}

export interface AssessmentProjectQuestion {
  id: string;
  query: string;
  passages: { id: string; text: string }[];
  isUnanswerable: boolean;
}

export interface AssessmentCriterionResult {
  criterionId: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface AssessmentAttempt {
  id: string;
  rubricVersionId: string;
  knowledgeCheckScore: number; // 0-100
  projectTestsPassed: number;
  projectTestsTotal: number;
  criticalChecks: AssessmentCriterionResult[];
  passed: boolean;
  completedAt: string;
}

export interface VerifiedSkillEvidence {
  skill: string;
  assessmentAttemptId: string;
  rubricVersion: string;
  verifiedAt: string;
}

export interface ResumeDraft {
  id: string;
  before: string[];
  proposedAdditions: {
    id: string;
    section: "Projects & Practical Training";
    text: string;
    evidenceAttemptId: string;
  }[];
  approved: boolean;
}

export interface ProgressMilestone {
  id: string;
  title: string;
  completedAt: string | null;
  status: "complete" | "in_progress" | "upcoming";
}

export interface WellbeingCheckIn {
  id: string;
  pace: "comfortable" | "a_bit_much" | "overwhelmed";
  createdAt: string;
}

export type WorkflowStatus = "pending" | "running" | "complete" | "failed";

export interface Workflow<T = unknown> {
  workflowId: string;
  status: WorkflowStatus;
  result: T | null;
  error: string | null;
}

export interface ApiErrorShape {
  status: number;
  message: string;
}
