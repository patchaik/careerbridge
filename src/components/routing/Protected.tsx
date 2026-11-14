import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { MAIN_PATH, TARGET_INDEX, useJourney } from "../../context/JourneyContext";

// Guards a main-journey page at `index` (its position in MAIN_PATH): requires
// sign-in, redirects any attempt to skip ahead back to the furthest page
// actually reached, and — the one legitimate case of visiting exactly the
// next page in sequence — extends progress by one step.
export function Protected({ index, children }: { index: number; children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const { furthestStepIndex, advanceFurthestStep } = useJourney();

  useEffect(() => {
    if (isSignedIn && index === furthestStepIndex + 1) {
      advanceFurthestStep(index);
    }
  }, [isSignedIn, index, furthestStepIndex, advanceFurthestStep]);

  if (!isSignedIn) return <Navigate to="/signin" replace />;
  if (index > furthestStepIndex + 1) {
    return <Navigate to={MAIN_PATH[furthestStepIndex]} replace />;
  }
  return <>{children}</>;
}

// Guards a side-branch page (currently just /recommendations, off /target).
// Reachable as soon as its anchor step is reached; visiting it never moves
// furthestStepIndex itself since it isn't part of the main sequence.
export function ProtectedBranch({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const { furthestStepIndex } = useJourney();

  if (!isSignedIn) return <Navigate to="/signin" replace />;
  if (furthestStepIndex < TARGET_INDEX) {
    return <Navigate to={MAIN_PATH[furthestStepIndex]} replace />;
  }
  return <>{children}</>;
}
