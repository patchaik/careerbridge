// Mock-only "AI outlook" for /target and role suggestions for
// /recommendations — no contract endpoint exists yet (see
// docs/API_PROPOSALS.md's POST /roles/outlook, POST /roles/recommend).
// Everything here is a deterministic signal, never a prediction or a
// verified assessment.

import type {
  AutomationExposure,
  CandidateSkillEvidence,
  DemandTrend,
  ExperienceLevel,
  RecommendedRole,
  RoleOutlook,
  RoleRecommendation,
  RoleRisk,
  Situation,
} from "../types";

interface RoleKnowledge {
  skills: string[];
  exposure: AutomationExposure;
  demandTrend: DemandTrend;
  recommended: string[]; // role names — looked up in ROLE_KNOWLEDGE, or described generically
}

const ROLE_KNOWLEDGE: Record<string, RoleKnowledge> = {
  "ai developer": {
    skills: ["Python", "Machine Learning", "PyTorch", "SQL", "REST APIs", "Docker", "MLOps", "Prompt Engineering"],
    exposure: "medium",
    demandTrend: "growing",
    recommended: ["ml engineer", "software engineer, ai applications", "data engineer"],
  },
  "software engineer": {
    skills: ["Java", "Python", "SQL", "REST APIs", "Docker", "Git", "Testing", "System Design"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["ai developer", "devops engineer", "data engineer"],
  },
  "software engineer, ai applications": {
    skills: ["Python", "REST APIs", "SQL", "Docker", "Machine Learning", "System Design"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["ai developer", "ml engineer", "software engineer"],
  },
  "ml engineer": {
    skills: ["Python", "Machine Learning", "PyTorch", "MLOps", "SQL", "Docker", "Statistics"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["ai developer", "data engineer", "software engineer, ai applications"],
  },
  "data engineer": {
    skills: ["SQL", "Python", "ETL", "Data Warehousing", "Docker", "Spark"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["data analyst", "ml engineer", "software engineer"],
  },
  "data analyst": {
    skills: ["SQL", "Excel", "Data Visualization", "Statistics", "Python", "Communication"],
    exposure: "medium",
    demandTrend: "stable",
    recommended: ["data engineer", "business analyst", "ml engineer"],
  },
  "manual qa tester": {
    skills: ["Test Planning", "Bug Tracking", "Regression Testing", "Communication"],
    exposure: "high",
    demandTrend: "declining",
    recommended: ["qa automation engineer", "software engineer, ai applications", "business analyst"],
  },
  "qa automation engineer": {
    skills: ["Test Automation", "Python", "Java", "CI/CD", "Git", "Test Planning"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["software engineer", "devops engineer", "data analyst"],
  },
  "customer support representative": {
    skills: ["Communication", "Troubleshooting", "CRM Tools", "Patience", "Writing"],
    exposure: "high",
    demandTrend: "declining",
    recommended: ["customer success manager", "business analyst", "project manager"],
  },
  "customer success manager": {
    skills: ["Communication", "Relationship Management", "CRM Tools", "Problem Solving", "Project Coordination"],
    exposure: "low",
    demandTrend: "stable",
    recommended: ["project manager", "business analyst", "customer support representative"],
  },
  "project manager": {
    skills: ["Planning", "Communication", "Stakeholder Management", "Risk Management", "Agile"],
    exposure: "low",
    demandTrend: "stable",
    recommended: ["business analyst", "customer success manager", "scrum master"],
  },
  "business analyst": {
    skills: ["Requirements Gathering", "SQL", "Communication", "Data Visualization", "Process Mapping"],
    exposure: "medium",
    demandTrend: "stable",
    recommended: ["data analyst", "project manager", "customer success manager"],
  },
  "devops engineer": {
    skills: ["Docker", "CI/CD", "Linux", "Python", "Cloud Infrastructure", "Monitoring"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["software engineer", "data engineer", "qa automation engineer"],
  },
  "registered nurse": {
    skills: ["Patient Care", "Clinical Assessment", "Communication", "Medical Documentation"],
    exposure: "low",
    demandTrend: "growing",
    recommended: ["nurse practitioner", "clinical coordinator"],
  },
};

const GENERIC_RECOMMENDED = ["project manager", "business analyst", "data analyst"];

const SOURCES = [
  "Bureau of Labor Statistics Occupational Outlook Handbook",
  "World Economic Forum Future of Jobs Report",
  "Demo signal — not a live labor-market feed",
];

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function knowledgeFor(role: string): RoleKnowledge {
  const key = normalizeRole(role);
  if (ROLE_KNOWLEDGE[key]) return ROLE_KNOWLEDGE[key];
  // Loose match: the target role contains, or is contained by, a known key.
  const found = Object.entries(ROLE_KNOWLEDGE).find(
    ([k]) => key.includes(k) || k.includes(key),
  );
  if (found) return found[1];
  return {
    skills: ["Communication", "Problem Solving", "Domain Knowledge"],
    exposure: "medium",
    demandTrend: "stable",
    recommended: GENERIC_RECOMMENDED,
  };
}

function skillOverlap(skills: string[], profileSkills: CandidateSkillEvidence[]): { matched: number; total: number } {
  const owned = new Set(profileSkills.map((s) => s.skill.toLowerCase()));
  const matched = skills.filter((s) => owned.has(s.toLowerCase())).length;
  return { matched, total: skills.length };
}

function situationFrame(situation: Situation | null): string {
  switch (situation) {
    case "no_job":
      return "Since you're currently between roles, this is a good moment to weigh the path with the strongest near-term demand.";
    case "upskill":
      return "Since you're looking to grow where you are, this outlook is about strengthening your position, not necessarily changing roles.";
    case "new_career":
      return "Since you're exploring a new direction, treat this as one data point among several as you compare paths.";
    default:
      return "Treat this as one data point among several as you plan your next move.";
  }
}

function experienceFrame(experienceLevel: ExperienceLevel | null, yearsOfExperience: number | null): string {
  if (!experienceLevel) return "";
  const years = yearsOfExperience !== null ? ` and ${yearsOfExperience} year${yearsOfExperience === 1 ? "" : "s"} of experience` : "";
  const byLevel: Record<ExperienceLevel, string> = {
    beginner: `As someone early in their career${years}, the roles below lean toward ones with accessible entry points.`,
    intermediate: `With solid working experience${years}, you're well-positioned to move laterally into adjacent roles.`,
    expert: `With deep experience${years}, you likely have more transferable leverage than this surface-level comparison can fully capture.`,
  };
  return byLevel[experienceLevel];
}

function risksFor(exposure: AutomationExposure, role: string): RoleRisk[] {
  if (exposure === "high") {
    return [
      {
        id: "risk-routine",
        label: "Routine tasks are increasingly automated",
        severity: "high",
        detail: `Much of the day-to-day work in ${role} roles overlaps with what current AI tools already do reasonably well.`,
      },
      {
        id: "risk-entry",
        label: "Entry-level postings are shrinking",
        severity: "medium",
        detail: "Employers are posting fewer junior openings in this space than a few years ago.",
      },
    ];
  }
  if (exposure === "medium") {
    return [
      {
        id: "risk-partial",
        label: "Some tasks are being automated, not the whole role",
        severity: "medium",
        detail: `Parts of ${role} work (repetitive analysis, first-draft output) are increasingly AI-assisted, while judgment-heavy parts aren't.`,
      },
    ];
  }
  return [
    {
      id: "risk-low",
      label: "Automation risk is currently low",
      severity: "low",
      detail: "Current AI tools handle narrow sub-tasks here, not the role's core judgment calls.",
    },
  ];
}

function whatStaysHumanFor(): string[] {
  return [
    "Judgment calls in ambiguous or high-stakes situations",
    "Stakeholder communication, negotiation, and trust-building",
    "Mentoring and team leadership",
    "Creative problem-solving across unfamiliar systems",
  ];
}

function suggestionsFor(exposure: AutomationExposure, situation: Situation | null): string[] {
  const base: string[] = [];
  if (exposure === "high") {
    base.push("Build evidence in a more automation-resistant adjacent role before it becomes urgent.");
  } else if (exposure === "medium") {
    base.push("Lean into the judgment-heavy, cross-functional parts of the role — they're the hardest to automate.");
  } else {
    base.push("Keep building depth — this role's exposure is currently low, but revisit this outlook periodically.");
  }
  base.push("Treat AI tools as something to get fluent with, not just a threat — using them well is itself a skill employers value.");
  if (situation === "no_job") base.push("Prioritize roles with near-term openings over the theoretically ideal fit.");
  return base;
}

export function generateRoleOutlook(
  targetRole: string,
  profileSkills: CandidateSkillEvidence[],
  situation: Situation | null,
  experienceLevel: ExperienceLevel | null,
  yearsOfExperience: number | null,
): RoleOutlook {
  const knowledge = knowledgeFor(targetRole);
  const frames = [situationFrame(situation), experienceFrame(experienceLevel, yearsOfExperience)].filter(Boolean);

  const recommendedRoles: RecommendedRole[] = knowledge.recommended.slice(0, 4).map((name) => {
    const titled = name.replace(/\b\w/g, (c) => c.toUpperCase());
    const roleKnowledge = knowledgeFor(name);
    const overlap = skillOverlap(roleKnowledge.skills, profileSkills);
    return {
      role: titled,
      why: `${overlap.matched} of ${overlap.total} typical skills for this role already show up in your profile.`,
      skillOverlap: overlap,
      outlook: roleKnowledge.exposure,
      demandTrend: roleKnowledge.demandTrend,
    };
  });

  return {
    targetRole,
    exposure: knowledge.exposure,
    demandTrend: knowledge.demandTrend,
    summary:
      `${targetRole} currently shows ${knowledge.exposure} automation exposure and ${knowledge.demandTrend} demand. ` +
      frames.join(" "),
    risks: risksFor(knowledge.exposure, targetRole),
    whatStaysHuman: whatStaysHumanFor(),
    recommendedRoles,
    suggestions: suggestionsFor(knowledge.exposure, situation),
    sources: SOURCES,
    isDemoData: true,
  };
}

export function generateRoleRecommendations(
  profileSkills: CandidateSkillEvidence[],
  situation: Situation | null,
): RoleRecommendation[] {
  const candidates = Object.keys(ROLE_KNOWLEDGE);
  const scored = candidates.map((name) => {
    const knowledge = ROLE_KNOWLEDGE[name];
    const overlap = skillOverlap(knowledge.skills, profileSkills);
    return { name, knowledge, overlap };
  });

  scored.sort((a, b) => b.overlap.matched / b.overlap.total - a.overlap.matched / a.overlap.total);

  const top = scored.slice(0, 6).filter((s) => s.overlap.matched > 0);
  const pool = top.length >= 3 ? top : scored.slice(0, 6);

  const ownedLower = new Set(profileSkills.map((s) => s.skill.toLowerCase()));

  return pool.map(({ name, knowledge, overlap }) => {
    const titled = name.replace(/\b\w/g, (c) => c.toUpperCase());
    const transferableSkills = knowledge.skills.filter((s) => ownedLower.has(s.toLowerCase()));
    const skillsToLearn = knowledge.skills.filter((s) => !ownedLower.has(s.toLowerCase()));
    const whyBase = `${overlap.matched} of ${overlap.total} skills transfer directly from your profile.`;
    const why =
      situation === "new_career"
        ? `${whyBase} A reasonable option to explore if you're open to a different direction.`
        : whyBase;
    return {
      role: titled,
      why,
      skillOverlap: overlap,
      transferableSkills,
      skillsToLearn,
      outlook: knowledge.exposure,
      demandTrend: knowledge.demandTrend,
    };
  });
}
