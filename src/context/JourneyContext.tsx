import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  AssessmentAttempt,
  CandidateProfile,
  LearningPath,
  ResumeDraft,
} from "../lib/types";

const STORAGE_KEY = "careerbridge:journey";

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
  lostJobToAI: boolean;
  selectedSkills: string[];
  targetRole: string | null;
  chosenSkill: string | null;
  learningPath: LearningPath | null;
  assessmentAttempt: AssessmentAttempt | null;
  resumeDraft: ResumeDraft | null;
  wellbeingEnabled: boolean;
  furthestStepIndex: number;
}

const initialState: JourneyState = {
  profile: null,
  lostJobToAI: false,
  selectedSkills: [],
  targetRole: null,
  chosenSkill: null,
  learningPath: null,
  assessmentAttempt: null,
  resumeDraft: null,
  wellbeingEnabled: true,
  furthestStepIndex: 0,
};

function loadState(): JourneyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return { ...initialState, ...JSON.parse(raw) };
  } catch {
    return initialState;
  }
}

function saveState(state: JourneyState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (e.g. private browsing) — journey just won't persist
  }
}

interface JourneyContextValue extends JourneyState {
  setProfile: (profile: CandidateProfile | null) => void;
  setLostJobToAI: (value: boolean) => void;
  setSelectedSkills: (skills: string[]) => void;
  setTargetRole: (role: string | null) => void;
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
  const [state, setState] = useState<JourneyState>(loadState);

  useEffect(() => saveState(state), [state]);

  const value: JourneyContextValue = {
    ...state,
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
    setLostJobToAI: (lostJobToAI) => setState((s) => ({ ...s, lostJobToAI })),
    setSelectedSkills: (selectedSkills) => setState((s) => ({ ...s, selectedSkills })),
    setTargetRole: (targetRole) => setState((s) => ({ ...s, targetRole })),
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
