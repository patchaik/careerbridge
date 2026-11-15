import type { CandidateProfile, CandidateSkillEvidence } from "../types";
import { isReal } from "./endpoints";
import { mockCreateProfile, mockParseResume, type CreateProfileInput } from "../mock/handlers";
import { apiRequest, ApiError } from "./client";
import { registerCompletedWorkflow, registerFailedWorkflow } from "./realWorkflowCache";

// --- Backend wire shape (api/openapi.yaml's Profile schema, snake_case) ---
interface BackendSkillEvidence {
  id: string;
  skill_id: string;
  skill: string;
  category: "technical" | "interpersonal" | "domain";
  evidence_type: "resume" | "self_reported" | "diagnostic";
  status: CandidateSkillEvidence["status"];
  excerpt: string | null;
}

interface BackendProfile {
  id: string;
  user_id: string;
  source: "resume" | "manual";
  has_file: boolean;
  confirmed_at: string | null;
  skills: BackendSkillEvidence[];
}

function mapBackendSkill(skill: BackendSkillEvidence): CandidateSkillEvidence {
  return {
    id: skill.id,
    skill: skill.skill,
    category: skill.category,
    status: skill.status,
    source: skill.evidence_type === "resume" ? "resume" : "user",
    sourceExcerpt: skill.excerpt,
  };
}

export function mapBackendProfile(profile: BackendProfile): CandidateProfile {
  return {
    id: profile.id,
    userId: profile.user_id,
    source: profile.source,
    hasFile: profile.has_file,
    targetRole: null,
    location: null,
    level: null,
    workMode: null,
    skills: profile.skills.map(mapBackendSkill),
    situation: null, // client-side only in both modes — see docs/API_PROPOSALS.md
    confirmedAt: profile.confirmed_at,
  };
}

// Extracts skills from an uploaded résumé only — StartPage merges the result
// into its own skills list rather than this call producing a full profile.
// Real mode: POST /api/onboarding/parse answers synchronously (mock-mode
// agents run in-process), so the result is wrapped in an already-"complete"
// local workflow — see realWorkflowCache.ts — rather than actually polling.
export async function parseResume(
  file: File,
  simulateFailure = false,
): Promise<{ workflowId: string }> {
  if (!isReal("parseOnboarding")) return { workflowId: mockParseResume(simulateFailure) };

  try {
    const body = new FormData();
    body.append("file", file);
    const profile = await apiRequest<BackendProfile>("/api/onboarding/parse", { method: "POST", body });
    const mapped = mapBackendProfile(profile);
    return { workflowId: registerCompletedWorkflow({ skills: mapped.skills, profileId: mapped.id }) };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "We couldn't read that file.";
    return { workflowId: registerFailedWorkflow(message) };
  }
}

export type { CreateProfileInput };

// Real mode: the contract has no "create profile from compiled skills"
// endpoint (unlike the mock layer's single-shot design) — parse creates the
// profile (from the résumé, or from manual skills if none was uploaded) and
// confirm finalizes whatever skills StartPage compiled. See
// docs/INTEGRATION_NOTES.md for why this is two calls here but one in mock.
export async function createProfile(
  input: CreateProfileInput & { profileId?: string },
): Promise<{ workflowId: string }> {
  if (!isReal("confirmProfile")) return { workflowId: mockCreateProfile(input) };

  try {
    let profileId = input.profileId;
    if (!profileId) {
      const created = await apiRequest<BackendProfile>("/api/onboarding/parse", {
        method: "POST",
        body: { skills: input.skills.map((s) => s.skill) },
      });
      profileId = created.id;
    }

    const confirmed = await apiRequest<BackendProfile>(`/api/profiles/${profileId}/confirm`, {
      method: "PUT",
      idempotencyKey: crypto.randomUUID(),
      body: {
        skills: input.skills.map((s) => ({
          skill: s.skill,
          status: s.source === "resume" ? "present" : "self_reported",
        })),
      },
    });
    return { workflowId: registerCompletedWorkflow({ profile: mapBackendProfile(confirmed) }) };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "We couldn't build your profile.";
    return { workflowId: registerFailedWorkflow(message) };
  }
}
