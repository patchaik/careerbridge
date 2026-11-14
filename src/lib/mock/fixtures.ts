// Demo persona: software developer (5 yrs, Java/Spring Boot/REST/Oracle/Docker)
// targeting "Software Engineer — AI Applications". Primary gap: RAG (beginner).
// All data here is fixture data for the AI for Good Buildathon demo — never real.

import type {
  AssessmentAttempt,
  AssessmentProjectQuestion,
  CandidateProfile,
  CandidateSkillEvidence,
  JobPosting,
  JobSkillRequirement,
  KnowledgeCheckQuestion,
  LearningPath,
  LearningResource,
  MarketSkill,
  ProgressMilestone,
  ResumeDraft,
  RubricVersion,
  SkillAnalysis,
  SkillGap,
  VerifiedSkillEvidence,
} from "../types";

export const DEMO_PROVIDER = "Demo Job Feed (fixture)";
export const RETRIEVED_AT = "2026-11-10T09:00:00Z";
export const CACHED_SNAPSHOT_AT = "2026-11-08T09:00:00Z";

export const demoResumeSkills: CandidateSkillEvidence[] = [
  {
    skill: "Java",
    category: "technical",
    status: "present",
    sourceExcerpt: "5 years building backend services in Java across two teams.",
  },
  {
    skill: "Spring Boot",
    category: "technical",
    status: "present",
    sourceExcerpt: "Built and maintained REST APIs with Spring Boot and Spring Data.",
  },
  {
    skill: "REST APIs",
    category: "technical",
    status: "present",
    sourceExcerpt: "Designed and documented REST APIs consumed by 3 internal teams.",
  },
  {
    skill: "Oracle",
    category: "technical",
    status: "present",
    sourceExcerpt: "Wrote and tuned PL/SQL against an Oracle 19c database.",
  },
  {
    skill: "Docker",
    category: "technical",
    status: "present",
    sourceExcerpt: "Containerized services with Docker for staging and production.",
  },
  {
    skill: "Collaboration",
    category: "interpersonal",
    status: "self_reported",
    sourceExcerpt: null,
  },
];

export const demoProfile: CandidateProfile = {
  id: "profile_demo_1",
  targetRole: "Software Engineer — AI Applications",
  location: "Remote",
  level: "Mid-level",
  workMode: "remote",
  skills: demoResumeSkills,
  confirmedAt: null,
};

export const demoJobPostings: JobPosting[] = [
  {
    id: "job_01",
    title: "Software Engineer, AI Applications",
    company: "Northwind Analytics",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_01",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_02",
    title: "Backend Engineer, Platform",
    company: "Northwind Analytics",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_02",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_03",
    title: "AI Applications Engineer",
    company: "Harborline Systems",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_03",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_04",
    title: "Java Backend Developer",
    company: "Harborline Systems",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_04",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "partial",
  },
  {
    id: "job_05",
    title: "Full-Stack Engineer",
    company: "Cedar & Finch",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_05",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_06",
    title: "Software Engineer — Applied AI",
    company: "Cedar & Finch",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_06",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_07",
    title: "Platform Engineer",
    company: "Ridgeline Labs",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_07",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "unavailable",
  },
  {
    id: "job_08",
    title: "Backend Engineer, Java",
    company: "Ridgeline Labs",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_08",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_09",
    title: "Software Engineer, AI Applications",
    company: "Summerlin Health",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_09",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
  {
    id: "job_10",
    title: "Senior Backend Engineer",
    company: "Summerlin Health",
    provider: DEMO_PROVIDER,
    url: "https://example.com/jobs/job_10",
    retrievedAt: RETRIEVED_AT,
    isDemoFixture: true,
    descriptionCompleteness: "complete",
  },
];

export const demoJobSkillRequirements: JobSkillRequirement[] = [
  // RAG — 4 of 10 postings
  { jobId: "job_01", skill: "Retrieval-Augmented Generation (RAG)", importance: "required", sourceExcerpt: "Build retrieval-augmented pipelines that ground model answers in internal documents." },
  { jobId: "job_03", skill: "Retrieval-Augmented Generation (RAG)", importance: "required", sourceExcerpt: "Experience with RAG architectures and vector search is strongly preferred." },
  { jobId: "job_06", skill: "Retrieval-Augmented Generation (RAG)", importance: "preferred", sourceExcerpt: "Familiarity with retrieval-augmented generation for grounding LLM output." },
  { jobId: "job_09", skill: "Retrieval-Augmented Generation (RAG)", importance: "required", sourceExcerpt: "Design and maintain RAG workflows that cite source passages." },

  // Java — present across most postings
  { jobId: "job_01", skill: "Java", importance: "required", sourceExcerpt: "5+ years of Java backend development." },
  { jobId: "job_02", skill: "Java", importance: "required", sourceExcerpt: "Strong Java and Spring ecosystem experience." },
  { jobId: "job_03", skill: "Java", importance: "preferred", sourceExcerpt: "Java experience is a plus for our JVM services." },
  { jobId: "job_04", skill: "Java", importance: "required", sourceExcerpt: "Core Java, Spring Boot, and REST API development." },
  { jobId: "job_08", skill: "Java", importance: "required", sourceExcerpt: "Java backend engineer for our platform team." },
  { jobId: "job_10", skill: "Java", importance: "required", sourceExcerpt: "Senior-level Java and distributed systems experience." },

  // REST APIs
  { jobId: "job_01", skill: "REST APIs", importance: "required", sourceExcerpt: "Design and document REST APIs for internal consumers." },
  { jobId: "job_02", skill: "REST APIs", importance: "required", sourceExcerpt: "Build and version REST APIs serving mobile and web clients." },
  { jobId: "job_04", skill: "REST APIs", importance: "required", sourceExcerpt: "Core Java, Spring Boot, and REST API development." },
  { jobId: "job_05", skill: "REST APIs", importance: "preferred", sourceExcerpt: "Comfortable building REST endpoints for a React frontend." },
  { jobId: "job_08", skill: "REST APIs", importance: "required", sourceExcerpt: "Maintain REST APIs with strict backwards compatibility." },

  // Docker
  { jobId: "job_01", skill: "Docker", importance: "required", sourceExcerpt: "Containerize and deploy services with Docker." },
  { jobId: "job_03", skill: "Docker", importance: "preferred", sourceExcerpt: "Docker experience for local development and CI." },
  { jobId: "job_07", skill: "Docker", importance: "required", sourceExcerpt: "Own containerized deployments across environments." },
  { jobId: "job_09", skill: "Docker", importance: "preferred", sourceExcerpt: "Docker-based local development workflow." },

  // Python
  { jobId: "job_01", skill: "Python", importance: "preferred", sourceExcerpt: "Python is used for our model-serving layer." },
  { jobId: "job_03", skill: "Python", importance: "required", sourceExcerpt: "Daily Python work across our AI applications team." },
  { jobId: "job_06", skill: "Python", importance: "required", sourceExcerpt: "Python services for applied AI features." },
  { jobId: "job_09", skill: "Python", importance: "preferred", sourceExcerpt: "Some Python exposure helpful for the applied AI team." },

  // Vector databases
  { jobId: "job_03", skill: "Vector Databases", importance: "preferred", sourceExcerpt: "Experience with a vector database (e.g. pgvector, Pinecone) is a plus." },
  { jobId: "job_06", skill: "Vector Databases", importance: "preferred", sourceExcerpt: "Familiarity with embedding storage and vector search." },
  { jobId: "job_09", skill: "Vector Databases", importance: "preferred", sourceExcerpt: "Vector search experience helps with our retrieval layer." },

  // Prompt engineering
  { jobId: "job_01", skill: "Prompt Engineering", importance: "preferred", sourceExcerpt: "Comfort iterating on prompts for production LLM features." },
  { jobId: "job_06", skill: "Prompt Engineering", importance: "preferred", sourceExcerpt: "Hands-on prompt design for applied AI features." },

  // Kubernetes — present in enough postings to be a gap, not quickly learnable
  { jobId: "job_02", skill: "Kubernetes", importance: "required", sourceExcerpt: "Operate services on our Kubernetes platform." },
  { jobId: "job_07", skill: "Kubernetes", importance: "required", sourceExcerpt: "Own Kubernetes manifests and rollout strategy." },
  { jobId: "job_10", skill: "Kubernetes", importance: "required", sourceExcerpt: "3+ years operating production Kubernetes clusters." },

  // Oracle — candidate already has this
  { jobId: "job_04", skill: "Oracle", importance: "preferred", sourceExcerpt: "Oracle database experience is a plus." },
  { jobId: "job_08", skill: "Oracle", importance: "required", sourceExcerpt: "Core data layer runs on Oracle." },
];

const totalPostings = demoJobPostings.length;

function jobIdsFor(skill: string, requirements: JobSkillRequirement[]): string[] {
  return requirements.filter((r) => r.skill === skill).map((r) => r.jobId);
}

const marketSkillNames = [
  "Java",
  "REST APIs",
  "Docker",
  "Python",
  "Retrieval-Augmented Generation (RAG)",
  "Vector Databases",
  "Prompt Engineering",
  "Kubernetes",
  "Oracle",
];

export const demoMarketSkills: MarketSkill[] = marketSkillNames.map((skill) => {
  const reqs = demoJobSkillRequirements.filter((r) => r.skill === skill);
  const jobIds = jobIdsFor(skill, demoJobSkillRequirements);
  const candidateHas = demoResumeSkills.some(
    (s) => s.skill.toLowerCase() === skill.toLowerCase() && s.status === "present",
  );
  return {
    skill,
    importance: reqs.some((r) => r.importance === "required") ? "required" : "preferred",
    postingsMentioning: { count: jobIds.length, jobIds },
    totalPostings,
    candidateEvidenceStatus: candidateHas ? "present" : "not_established",
  };
});

export const demoSkillGaps: SkillGap[] = [
  {
    skill: "Retrieval-Augmented Generation (RAG)",
    postingsMentioning: {
      count: 4,
      jobIds: ["job_01", "job_03", "job_06", "job_09"],
    },
    totalPostings,
    candidateEvidenceStatus: "not_established",
    nextAction: "learn",
    rankingReason:
      "Required or preferred in 4 of 10 postings for this role, including 3 marked required. No evidence of this skill in your profile.",
    isLearnableQuickly: true,
    barrierExplanation: null,
  },
  {
    skill: "Kubernetes",
    postingsMentioning: {
      count: 3,
      jobIds: ["job_02", "job_07", "job_10"],
    },
    totalPostings,
    candidateEvidenceStatus: "not_established",
    nextAction: "none",
    rankingReason:
      "Required in 3 of 10 postings, each asking for multiple years of production experience.",
    isLearnableQuickly: false,
    barrierExplanation:
      "Postings ask for 3+ years operating production Kubernetes clusters — this typically comes from on-the-job experience rather than a short course. Consider seeking Kubernetes exposure in your current role before targeting postings that require it.",
  },
  {
    skill: "Vector Databases",
    postingsMentioning: {
      count: 3,
      jobIds: ["job_03", "job_06", "job_09"],
    },
    totalPostings,
    candidateEvidenceStatus: "not_established",
    nextAction: "diagnostic",
    rankingReason: "Mentioned as preferred in 3 of 10 postings, often alongside RAG.",
    isLearnableQuickly: true,
    barrierExplanation: null,
  },
];

export const demoSkillAnalysis: SkillAnalysis = {
  provider: DEMO_PROVIDER,
  retrievedAt: RETRIEVED_AT,
  postingsAnalyzed: totalPostings,
  isDemoData: true,
  dataQualityWarning: null,
  yourSkills: demoResumeSkills,
  marketSkills: demoMarketSkills,
  gaps: demoSkillGaps,
};

export const demoSkillAnalysisProviderUnavailable: SkillAnalysis = {
  ...demoSkillAnalysis,
  dataQualityWarning: `Provider unavailable — showing cached snapshot from ${CACHED_SNAPSHOT_AT.slice(0, 10)}.`,
  retrievedAt: CACHED_SNAPSHOT_AT,
};

export const ragRubric: RubricVersion = {
  id: "rubric_rag_v1",
  version: "v1.0",
  frozenAt: "2026-11-09T00:00:00Z",
  criteria: [
    { id: "knowledge_check", label: "Knowledge check score", type: "knowledge_check", threshold: "≥ 80%" },
    { id: "project_tests", label: "Project test cases passed", type: "project", threshold: "≥ 4 of 5" },
    { id: "valid_passage_support", label: "Every answer is backed by a retrieved passage", type: "critical", threshold: "Required" },
    { id: "no_invented_citations", label: "No invented or fabricated citations", type: "critical", threshold: "Required" },
    { id: "acknowledges_missing_evidence", label: "Says so when evidence is insufficient", type: "critical", threshold: "Required" },
  ],
};

export const ragLearningPath: LearningPath = {
  id: "path_rag_beginner",
  objective: "Beginner RAG: from basics to a working project",
  skill: "Retrieval-Augmented Generation (RAG)",
  status: "not_started",
  rubricVersion: ragRubric,
  milestones: [
    { id: "m1", order: 1, title: "Retrieval vs. generation", description: "Understand how retrieval and generation combine to ground an answer.", status: "in_progress" },
    { id: "m2", order: 2, title: "Chunking and grounding", description: "Learn how documents are split and matched to a query.", status: "locked" },
    { id: "m3", order: 3, title: "Build a mini pipeline", description: "Practice selecting passages and producing a grounded, cited answer.", status: "locked" },
    { id: "m4", order: 4, title: "Test unknown questions", description: "Practice recognizing when the available evidence can't answer a question.", status: "locked" },
  ],
};

export const ragResources: LearningResource[] = [
  { id: "res_1", title: "Retrieval-Augmented Generation, explained", provider: "DeepLearning.AI", url: "https://example.com/resources/rag-explained", priceType: "free", modality: "text", verifiedAt: "2026-11-05T00:00:00Z" },
  { id: "res_2", title: "RAG from Scratch", provider: "freeCodeCamp", url: "https://example.com/resources/rag-from-scratch", priceType: "free", modality: "video", verifiedAt: "2026-11-05T00:00:00Z" },
  { id: "res_3", title: "Chunking Strategies for Retrieval", provider: "Pinecone Learning Center", url: "https://example.com/resources/chunking-strategies", priceType: "free", modality: "text", verifiedAt: "2026-11-03T00:00:00Z" },
  { id: "res_4", title: "Grounded Generation Basics", provider: "Hugging Face", url: "https://example.com/resources/grounded-generation", priceType: "free", modality: "text", verifiedAt: "2026-11-03T00:00:00Z" },
  { id: "res_5", title: "Vector Search Fundamentals", provider: "Qdrant Academy", url: "https://example.com/resources/vector-search-fundamentals", priceType: "free", modality: "interactive", verifiedAt: "2026-11-01T00:00:00Z" },
  { id: "res_6", title: "Building RAG Applications", provider: "Coursera", url: "https://example.com/resources/building-rag-applications", priceType: "paid", modality: "course", verifiedAt: "2026-11-02T00:00:00Z" },
  { id: "res_7", title: "LLM Engineering: RAG in Production", provider: "Udemy", url: "https://example.com/resources/llm-engineering-rag", priceType: "paid", modality: "course", verifiedAt: "2026-10-30T00:00:00Z" },
];

export const diagnosticQuestions: KnowledgeCheckQuestion[] = [
  { id: "d1", prompt: "What does the \"retrieval\" step in RAG primarily do?", options: ["Generates the final answer text", "Finds relevant source passages for a query", "Trains the language model", "Formats the answer as JSON"], correctOptionIndex: 1 },
  { id: "d2", prompt: "Why ground an LLM's answer in retrieved passages?", options: ["To make responses faster", "To reduce hosting costs", "To tie the answer to verifiable source evidence", "To avoid using embeddings"], correctOptionIndex: 2 },
];

export const ragKnowledgeCheck: KnowledgeCheckQuestion[] = [
  { id: "k1", prompt: "How should a RAG system respond when retrieved passages don't contain the answer?", options: ["Answer using the model's general knowledge", "Say the available evidence is insufficient", "Return the closest passage anyway", "Refuse to respond at all"], correctOptionIndex: 1 },
  { id: "k2", prompt: "What is \"grounding\" in the context of RAG?", options: ["Deploying the model on-premises", "Tying generated text to retrieved source passages", "Reducing model latency", "Fine-tuning on labeled data"], correctOptionIndex: 1 },
  { id: "k3", prompt: "Why is chunking documents important before retrieval?", options: ["It makes storage cheaper only", "It lets the retriever match smaller, more relevant units of text", "It is required for all databases", "It removes the need for embeddings"], correctOptionIndex: 1 },
  { id: "k4", prompt: "A RAG answer cites a passage that does not actually support its claim. What's the correct assessment?", options: ["This is acceptable if the answer sounds right", "This is an invented citation and should fail review", "This is fine as long as the model is confident", "This only matters for legal documents"], correctOptionIndex: 1 },
  { id: "k5", prompt: "What is the main difference between a plain LLM answer and a RAG answer?", options: ["RAG answers are always shorter", "RAG answers are grounded in retrieved, citable evidence", "RAG does not use a language model", "There is no meaningful difference"], correctOptionIndex: 1 },
];

export const ragProjectQuestionsPractice: AssessmentProjectQuestion[] = [
  {
    id: "p1",
    query: "What is the refund window?",
    passages: [
      { id: "pa1", text: "Policy §2.1: Customers may request a refund within 30 days of purchase if the item is unused." },
      { id: "pa2", text: "Policy §4.3: Refund requests are processed within 5–7 business days once approved." },
      { id: "pa3", text: "Policy §1.0: This document covers returns, refunds, and exchanges for all retail purchases." },
    ],
    isUnanswerable: false,
  },
  {
    id: "p2",
    query: "Can a customer exchange an item for a different color?",
    passages: [
      { id: "pa4", text: "Policy §3.2: Exchanges are permitted for a different size or color within 14 days, subject to stock availability." },
      { id: "pa5", text: "Policy §3.5: Exchanged items must be in original packaging." },
    ],
    isUnanswerable: false,
  },
];

export const ragProjectQuestionsAssessment: AssessmentProjectQuestion[] = [
  {
    id: "a1",
    query: "How long does a customer have to request a refund?",
    passages: [
      { id: "aa1", text: "Policy §2.1: Customers may request a refund within 30 days of purchase if the item is unused." },
      { id: "aa2", text: "Policy §5.0: Store credit never expires." },
    ],
    isUnanswerable: false,
  },
  {
    id: "a2",
    query: "Are exchanges allowed for sale items?",
    passages: [
      { id: "aa3", text: "Policy §3.2: Exchanges are permitted for a different size or color within 14 days, subject to stock availability." },
      { id: "aa4", text: "Policy §4.3: Refund requests are processed within 5–7 business days once approved." },
    ],
    isUnanswerable: true,
  },
  {
    id: "a3",
    query: "What packaging condition is required for an exchange?",
    passages: [
      { id: "aa5", text: "Policy §3.5: Exchanged items must be in original packaging." },
      { id: "aa6", text: "Policy §1.0: This document covers returns, refunds, and exchanges for all retail purchases." },
    ],
    isUnanswerable: false,
  },
  {
    id: "a4",
    query: "How many business days does it take to process an approved refund?",
    passages: [
      { id: "aa7", text: "Policy §4.3: Refund requests are processed within 5–7 business days once approved." },
      { id: "aa8", text: "Policy §2.1: Customers may request a refund within 30 days of purchase if the item is unused." },
    ],
    isUnanswerable: false,
  },
  {
    id: "a5",
    query: "Does the store offer price matching with competitors?",
    passages: [
      { id: "aa9", text: "Policy §1.0: This document covers returns, refunds, and exchanges for all retail purchases." },
      { id: "aa10", text: "Policy §5.0: Store credit never expires." },
    ],
    isUnanswerable: true,
  },
];

export const passedAssessmentAttempt: AssessmentAttempt = {
  id: "attempt_1",
  rubricVersionId: ragRubric.id,
  knowledgeCheckScore: 100,
  projectTestsPassed: 4,
  projectTestsTotal: 5,
  criticalChecks: [
    { criterionId: "valid_passage_support", label: "Every answer is backed by a retrieved passage", passed: true, detail: "All cited passages supported the stated answer." },
    { criterionId: "no_invented_citations", label: "No invented or fabricated citations", passed: true, detail: "No citation pointed to a passage that didn't support it." },
    { criterionId: "acknowledges_missing_evidence", label: "Says so when evidence is insufficient", passed: true, detail: "Correctly flagged 2 of 2 unanswerable questions." },
  ],
  passed: true,
  completedAt: "2026-11-12T15:30:00Z",
};

export const verifiedSkillEvidence: VerifiedSkillEvidence[] = [
  {
    skill: "Retrieval-Augmented Generation (RAG)",
    assessmentAttemptId: passedAssessmentAttempt.id,
    rubricVersion: ragRubric.version,
    verifiedAt: passedAssessmentAttempt.completedAt,
  },
];

export const demoResumeDraft: ResumeDraft = {
  id: "resume_draft_1",
  before: [
    "Software Developer, Meridian Systems (2021–present) — Java, Spring Boot, REST APIs, Oracle, Docker.",
    "Built and maintained backend services for an internal claims-processing platform.",
  ],
  proposedAdditions: [
    {
      id: "addition_1",
      section: "Projects & Practical Training",
      text: "Built a prototype retrieval-grounded Q&A workflow with source references, verified through an independent beginner-RAG assessment (Rubric v1.0).",
      evidenceAttemptId: passedAssessmentAttempt.id,
    },
  ],
  approved: false,
};

export const demoProgressMilestones: ProgressMilestone[] = [
  { id: "pm1", title: "Profile confirmed", completedAt: "2026-11-10T09:10:00Z", status: "complete" },
  { id: "pm2", title: "Skill gap identified: RAG", completedAt: "2026-11-10T09:20:00Z", status: "complete" },
  { id: "pm3", title: "Learning path started", completedAt: "2026-11-11T10:00:00Z", status: "complete" },
  { id: "pm4", title: "Independent assessment passed", completedAt: "2026-11-12T15:30:00Z", status: "complete" },
  { id: "pm5", title: "Résumé evidence approved", completedAt: null, status: "upcoming" },
];
