import type { CandidateProfile, CandidateSkillEvidence, ExperienceLevel, Situation } from "../types";
import { isReal } from "./endpoints";
import { mockBuildProfile, mockConfirmProfile, mockParseResume } from "../mock/handlers";
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
    // situation/experienceLevel/yearsOfExperience are client-side/journey
    // state only in both modes — see docs/API_PROPOSALS.md. The backend
    // response never carries them; callers that already have them (e.g.
    // buildProfile) overlay them back onto the mapped profile.
    situation: null,
    experienceLevel: null,
    yearsOfExperience: null,
    confirmedAt: profile.confirmed_at,
  };
}

// Extracts skills from an uploaded résumé only — StartPage merges the result
// into its own skills list rather than this call producing a full profile.
// Real mode: POST /api/onboarding/parse saves the file/profile synchronously.
// Return that profile immediately and wrap the result in an already-"complete"
// local workflow — see realWorkflowCache.ts — rather than actually polling.
export async function parseResume(
  file: File,
  simulateFailure = false,
): Promise<{ workflowId: string; profile?: CandidateProfile }> {
  if (!isReal("parseOnboarding")) return { workflowId: mockParseResume(simulateFailure) };

  try {
    const body = new FormData();
    body.append("file", file);
    const profile = await apiRequest<BackendProfile>("/api/onboarding/parse", { method: "POST", body });
    const mapped = mapBackendProfile(profile);
    return { workflowId: registerCompletedWorkflow({ skills: mapped.skills, profileId: mapped.id }), profile: mapped };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "We couldn't read that file.";
    return { workflowId: registerFailedWorkflow(message) };
  }
}

// Refreshes a profile from the backend (the single source of truth for
// confirmed skills once a profile exists) — used when returning to /start
// or /interests, instead of trusting only what's cached in journey state.
// Real mode only: mock mode has no independent "backend" to refresh from —
// whatever's already in journey state's `profile` already is the full
// picture, so this throws rather than silently no-op, and callers only call
// it behind an isReal("getProfile") check.
export async function getProfile(profileId: string): Promise<CandidateProfile> {
  if (!isReal("getProfile")) throw new Error("getProfile is real-mode only");
  const profile = await apiRequest<BackendProfile>(`/api/profiles/${profileId}`);
  return mapBackendProfile(profile);
}

// Recover a missing/stale browser ID from this signed-in user's saved profile.
// Network/server errors must not be mistaken for an absent profile.
export async function getSavedProfile(profileId?: string): Promise<CandidateProfile | null> {
  if (profileId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(profileId)) {
    try { return await getProfile(profileId); }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
  }
  try {
    return mapBackendProfile(await apiRequest<BackendProfile>("/api/profiles/latest"));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function mergeSavedSkills(draft: CandidateSkillEvidence[], saved: CandidateSkillEvidence[]): CandidateSkillEvidence[] {
  const byName = new Map(saved.map(s => [s.skill.toLowerCase(), s]));
  return draft.map(s => byName.get(s.skill.toLowerCase()) ?? {
    ...s, id: null, source: "user", sourceExcerpt: null, status: "self_reported",
  });
}

export interface BuildProfileInput {
  /** Full evidence for skills already known (résumé-parsed, with excerpts, or
   * typed in manually with id: null). */
  skills: CandidateSkillEvidence[];
  situation: Situation;
  /** experienceLevel/yearsOfExperience have no home in api/openapi.yaml yet
   * (see docs/API_PROPOSALS.md) — client-side/journey state only, same as
   * situation, never sent to the backend. */
  experienceLevel: ExperienceLevel;
  yearsOfExperience: number;
  /** Set when a résumé was already parsed via parseResume — its profile
   * already exists in the backend, so building must not create a duplicate. */
  profileId?: string;
}

// Compiles what StartPage has gathered (résumé skills + manually typed ones)
// into a CandidateProfile that is NOT YET CONFIRMED (confirmedAt stays null).
// This is intentionally the only thing /start does — the user reviews and
// explicitly confirms on /interests (see confirmProfile below). Real mode:
// if no résumé was parsed, this is the first time the backend hears about
// the profile, so it creates one (POST /api/onboarding/parse with the
// compiled skill names) — still "awaiting confirmation" per the contract.
export async function buildProfile(input: BuildProfileInput): Promise<{ workflowId: string }> {
  if (!isReal("parseOnboarding")) return { workflowId: mockBuildProfile(input) };

  try {
    let saved = await getSavedProfile(input.profileId);
    if (!saved) {
      if (input.skills.some(s => s.source === "resume")) {
        throw new ApiError(409, "This résumé is not linked to a saved profile. Upload it again before continuing.");
      }
      saved = mapBackendProfile(await apiRequest<BackendProfile>("/api/onboarding/parse", {
        method: "POST", body: { skills: input.skills.map(s => s.skill) },
      }));
    }
    // The backend owns identity/file state and résumé evidence. Retain learner
    // additions/removals, but never promote cached/demo excerpts to saved evidence.
    const profile: CandidateProfile = {
      ...saved,
      skills: mergeSavedSkills(input.skills, saved.skills),
      situation: input.situation,
      experienceLevel: input.experienceLevel,
      yearsOfExperience: input.yearsOfExperience,
      confirmedAt: null,
    };
    return { workflowId: registerCompletedWorkflow({ profile }) };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "We couldn't build your profile.";
    return { workflowId: registerFailedWorkflow(message) };
  }
}

export interface ConfirmSkillInput {
  skill: string;
  status: "present" | "user_confirmed" | "self_reported" | "not_established";
  excerpt?: string | null;
}

// The ONLY call that finalizes the profile — fired exclusively by /interests'
// "Confirm my skills" button, never automatically. `removeSkillIds` targets
// backend-persisted skill-evidence rows (non-null CandidateSkillEvidence.id);
// skills the user removed before ever syncing to the backend simply aren't
// included in `skills` and need no removal call.
export async function confirmProfile(
  profileId: string,
  skills: ConfirmSkillInput[],
  removeSkillIds: string[] = [],
): Promise<CandidateProfile> {
  if (!isReal("confirmProfile")) return mockConfirmProfile(profileId, skills, removeSkillIds);

  const confirmed = await apiRequest<BackendProfile>(`/api/profiles/${profileId}/confirm`, {
    method: "PUT",
    idempotencyKey: crypto.randomUUID(),
    body: {
      skills: skills.map((s) => ({
        skill: s.skill,
        status: s.status,
        ...(s.excerpt ? { excerpt: s.excerpt } : {}),
      })),
      remove_skill_ids: removeSkillIds,
    },
  });
  return mapBackendProfile(confirmed);
}
