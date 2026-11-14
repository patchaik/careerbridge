import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AssessmentAttempt,
  CandidateProfile,
  LearningPath,
  ResumeDraft,
} from "../lib/types";

const STORAGE_KEY = "careerbridge:journey";

export type JourneyStepId =
  | "about"
  | "profile"
  | "direction"
  | "skills"
  | "learn"
  | "prove"
  | "progress";

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
  unlockedSteps: Set<JourneyStepId>;
  setProfile: (profile: CandidateProfile | null) => void;
  setLostJobToAI: (value: boolean) => void;
  setSelectedSkills: (skills: string[]) => void;
  setTargetRole: (role: string | null) => void;
  setChosenSkill: (skill: string | null) => void;
  setLearningPath: (path: LearningPath | null) => void;
  setAssessmentAttempt: (attempt: AssessmentAttempt | null) => void;
  setResumeDraft: (draft: ResumeDraft | null) => void;
  setWellbeingEnabled: (enabled: boolean) => void;
  resetJourney: () => void;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<JourneyState>(loadState);

  useEffect(() => saveState(state), [state]);

  const unlockedSteps = useMemo(() => {
    const steps = new Set<JourneyStepId>(["about", "profile"]);
    if (state.profile) steps.add("direction");
    if (state.targetRole) steps.add("skills");
    if (state.chosenSkill) steps.add("learn");
    if (state.learningPath) {
      steps.add("prove");
      steps.add("progress");
    }
    return steps;
  }, [state.profile, state.targetRole, state.chosenSkill, state.learningPath]);

  const value: JourneyContextValue = {
    ...state,
    unlockedSteps,
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
    setLostJobToAI: (lostJobToAI) => setState((s) => ({ ...s, lostJobToAI })),
    setSelectedSkills: (selectedSkills) => setState((s) => ({ ...s, selectedSkills })),
    setTargetRole: (targetRole) => setState((s) => ({ ...s, targetRole })),
    setChosenSkill: (chosenSkill) => setState((s) => ({ ...s, chosenSkill })),
    setLearningPath: (learningPath) => setState((s) => ({ ...s, learningPath })),
    setAssessmentAttempt: (assessmentAttempt) => setState((s) => ({ ...s, assessmentAttempt })),
    setResumeDraft: (resumeDraft) => setState((s) => ({ ...s, resumeDraft })),
    setWellbeingEnabled: (wellbeingEnabled) => setState((s) => ({ ...s, wellbeingEnabled })),
    resetJourney: () => setState(initialState),
  };

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within a JourneyProvider");
  return ctx;
}
