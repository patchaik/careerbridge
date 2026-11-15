import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type {
  AssessmentAttempt,
  CandidateProfile,
  CandidateSkillEvidence,
  ExperienceLevel,
  LearningPath,
  ResumeDraft,
  ResumeMeta,
  Situation,
} from "../lib/types";

const STORAGE_PREFIX = "careerbridge:journey";

// Canonical forward order of the main journey. A page's index here is both
// its nav-lock threshold and its route-guard threshold — see
// src/components/routing/Protected.tsx. "/recommendations" is a side branch
// off "/target" and isn't part of this list (see TARGET_INDEX).
export const MAIN_PATH = [
  "/",
  "/start",
  "/interests",
  "/critique",
  "/target",
  "/skills",
  "/courses",
  "/learn",
  "/arena",
  "/assessment",
  "/resume",
  "/jobs",
  "/progress",
] as const;

export const TARGET_INDEX = MAIN_PATH.indexOf("/target");

interface JourneyState {
  profile: CandidateProfile | null;
  situation: Situation | null;
  experienceLevel: ExperienceLevel | null;
  yearsOfExperience: number | null;
  // Draft /start state — skills/interests/résumé info before the profile is
  // built and confirmed. Without these, returning to /start after navigating
  // away loses everything that wasn't already baked into `profile` (see the
  // root-cause note in JourneyProvider below).
  draftSkills: string[];
  draftFromResume: string[];
  draftResumeSkillEvidence: CandidateSkillEvidence[];
  resumeMeta: ResumeMeta | null;
  userInterests: string[];
  selectedInterests: string[];
  // Human-readable labels for selectedInterests (which are ids, meaningless
  // once the analysis response that produced them isn't loaded) — resolved
  // and stored alongside selectedInterests so a returning, already-
  // confirmed user's summary can show them without re-running analysis.
  selectedInterestLabels: string[];
  targetRole: string | null;
  // Skills a user marked "I already have this skill" on /skills after
  // seeing a gap — not verified by any backend evidence, just a client-side
  // note hiding it from the gap list on return.
  selfReportedSkills: string[];
  chosenSkill: string | null;
  learningPath: LearningPath | null;
  assessmentAttempt: AssessmentAttempt | null;
  resumeDraft: ResumeDraft | null;
  wellbeingEnabled: boolean;
  furthestStepIndex: number;
}

const initialState: JourneyState = {
  profile: null,
  situation: null,
  experienceLevel: null,
  yearsOfExperience: null,
  draftSkills: [],
  draftFromResume: [],
  draftResumeSkillEvidence: [],
  resumeMeta: null,
  userInterests: [],
  selectedInterests: [],
  selectedInterestLabels: [],
  targetRole: null,
  selfReportedSkills: [],
  chosenSkill: null,
  learningPath: null,
  assessmentAttempt: null,
  resumeDraft: null,
  wellbeingEnabled: true,
  furthestStepIndex: 0,
};

// Keyed per signed-in Supabase user id — a fixed, un-scoped key would (a)
// leak one account's journey into another signed-in on the same browser,
// and (b) not actually explain the original bug (see StartPage.tsx), but
// it's still required: survive sign-out/sign-in, not just reloads.
function storageKey(userId: string | null): string | null {
  return userId ? `${STORAGE_PREFIX}:${userId}` : null;
}

function loadState(userId: string | null): JourneyState {
  const key = storageKey(userId);
  if (!key) return initialState;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState;
    return { ...initialState, ...JSON.parse(raw) };
  } catch {
    return initialState;
  }
}

function saveState(userId: string | null, state: JourneyState) {
  const key = storageKey(userId);
  if (!key) return; // signed out — nothing to persist under
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage unavailable (e.g. private browsing) — journey just won't persist
  }
}

interface JourneyContextValue extends JourneyState {
  setProfile: (profile: CandidateProfile | null) => void;
  setSituation: (situation: Situation | null) => void;
  setExperienceLevel: (level: ExperienceLevel | null) => void;
  setYearsOfExperience: (years: number | null) => void;
  setDraftSkills: (skills: string[]) => void;
  setDraftFromResume: (names: string[]) => void;
  setDraftResumeSkillEvidence: (evidence: CandidateSkillEvidence[]) => void;
  setResumeMeta: (meta: ResumeMeta | null) => void;
  setUserInterests: (interests: string[]) => void;
  setSelectedInterests: (interests: string[]) => void;
  setSelectedInterestLabels: (labels: string[]) => void;
  setTargetRole: (role: string | null) => void;
  setSelfReportedSkills: (skills: string[]) => void;
  setChosenSkill: (skill: string | null) => void;
  setLearningPath: (path: LearningPath | null) => void;
  setAssessmentAttempt: (attempt: AssessmentAttempt | null) => void;
  setResumeDraft: (draft: ResumeDraft | null) => void;
  setWellbeingEnabled: (enabled: boolean) => void;
  /** Extends progress to `index` — never moves it backwards, even if called with a smaller value. */
  advanceFurthestStep: (index: number) => void;
  resetJourney: () => void;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const { user, isInitializing } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<JourneyState>(() => loadState(userId));
  // Tracks which user's data `state` currently holds, so the load effect
  // only fires on an actual sign-in/sign-out/account-switch — not on every
  // render — and so the save effect never fires before that reload happens
  // (which would otherwise overwrite the next user's stored state with the
  // previous user's in-memory state for one tick).
  const loadedForUserId = useRef<string | null>(userId);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (isInitializing) return; // don't know the real user yet
    if (hasLoadedOnce.current && loadedForUserId.current === userId) return;
    hasLoadedOnce.current = true;
    loadedForUserId.current = userId;
    setState(loadState(userId));
  }, [userId, isInitializing]);

  useEffect(() => {
    if (isInitializing) return;
    if (loadedForUserId.current !== userId) return; // state is still the previous user's — don't save it under this one
    saveState(userId, state);
  }, [state, userId, isInitializing]);

  const value: JourneyContextValue = {
    ...state,
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
    setSituation: (situation) => setState((s) => ({ ...s, situation })),
    setExperienceLevel: (experienceLevel) => setState((s) => ({ ...s, experienceLevel })),
    setYearsOfExperience: (yearsOfExperience) => setState((s) => ({ ...s, yearsOfExperience })),
    setDraftSkills: (draftSkills) => setState((s) => ({ ...s, draftSkills })),
    setDraftFromResume: (draftFromResume) => setState((s) => ({ ...s, draftFromResume })),
    setDraftResumeSkillEvidence: (draftResumeSkillEvidence) =>
      setState((s) => ({ ...s, draftResumeSkillEvidence })),
    setResumeMeta: (resumeMeta) => setState((s) => ({ ...s, resumeMeta })),
    setUserInterests: (userInterests) => setState((s) => ({ ...s, userInterests })),
    setSelectedInterests: (selectedInterests) => setState((s) => ({ ...s, selectedInterests })),
    setSelectedInterestLabels: (selectedInterestLabels) => setState((s) => ({ ...s, selectedInterestLabels })),
    setTargetRole: (targetRole) => setState((s) => ({ ...s, targetRole })),
    setSelfReportedSkills: (selfReportedSkills) => setState((s) => ({ ...s, selfReportedSkills })),
    setChosenSkill: (chosenSkill) => setState((s) => ({ ...s, chosenSkill })),
    setLearningPath: (learningPath) => setState((s) => ({ ...s, learningPath })),
    setAssessmentAttempt: (assessmentAttempt) => setState((s) => ({ ...s, assessmentAttempt })),
    setResumeDraft: (resumeDraft) => setState((s) => ({ ...s, resumeDraft })),
    setWellbeingEnabled: (wellbeingEnabled) => setState((s) => ({ ...s, wellbeingEnabled })),
    advanceFurthestStep: (index) =>
      setState((s) => ({ ...s, furthestStepIndex: Math.max(s.furthestStepIndex, index) })),
    resetJourney: () => setState(initialState),
  };

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within a JourneyProvider");
  return ctx;
}
