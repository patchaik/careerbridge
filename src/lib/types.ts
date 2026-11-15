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

// "domain" exists on the real backend (database/schema.sql's skills.category)
// but mock mode/this UI's /start only ever produces technical/interpersonal.
export type SkillCategory = "technical" | "interpersonal" | "domain";

export type EvidenceStatus =
  | "present"
  | "user_confirmed"
  | "self_reported"
  | "not_established"
  | "demonstrated";

// Where a skill entry came from: extracted from an uploaded résumé, or typed
// in directly by the candidate. Distinct from `status`, which describes how
// much evidence backs the skill later in the journey (/skills gap analysis).
export type SkillSource = "resume" | "user";

export interface CandidateSkillEvidence {
  id: string | null; // the backend's skill-evidence row id; null for not-yet-persisted mock entries
  skill: string;
  category: SkillCategory;
  status: EvidenceStatus;
  source: SkillSource;
  sourceExcerpt: string | null;
}

// What best describes the candidate's current situation — chosen on /start,
// used to tailor tone and emphasis later in the journey (e.g. supportive
// copy for "no_job", exploration-leaning recommendations for "new_career").
// No endpoint in api/openapi.yaml carries this — it's client-side/journey
// state only, in both mock and real mode. See docs/API_PROPOSALS.md.
export type Situation = "upskill" | "no_job" | "new_career";

export interface CandidateProfile {
  id: string;
  userId: string | null; // set when the profile came from the real backend
  source: "resume" | "manual";
  hasFile: boolean;
  targetRole: string | null;
  location: string | null;
  level: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  skills: CandidateSkillEvidence[];
  situation: Situation | null;
  confirmedAt: string | null;
}

// --- /interests (POST /interests/analyze) ---

// Where an interest came from: typed in by the candidate on /start, or
// inferred by the "AI" from the résumé (with the excerpt it came from).
export type InterestSource = "user" | "inferred";

export interface Interest {
  id: string;
  label: string;
  source: InterestSource;
  sourceExcerpt: string | null;
}

export interface InterestAnalysis {
  interests: Interest[];
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
