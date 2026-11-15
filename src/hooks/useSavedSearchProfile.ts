import { useEffect, useEffectEvent, useState } from "react";
import { useJourney } from "../context/JourneyContext";
import { isReal } from "../lib/api/endpoints";
import { getSavedProfile } from "../lib/api/onboarding";

export function useSavedSearchProfile() {
  const { profile, setProfile, situation, experienceLevel, yearsOfExperience } = useJourney();
  const needsRestore = !profile && isReal("getProfile");
  const [loading, setLoading] = useState(needsRestore);
  const [error, setError] = useState("");
  const applySaved = useEffectEvent((saved: NonNullable<Awaited<ReturnType<typeof getSavedProfile>>>) => {
    setProfile({ ...saved, situation, experienceLevel, yearsOfExperience });
  });
  useEffect(() => {
    if (!needsRestore) return;
    let active = true;
    getSavedProfile().then(saved => {
      if (active && saved) applySaved(saved);
    }).catch(() => {
      if (active) setError("Couldn’t load your saved profile. Reload this page to retry.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [needsRestore]);
  return { profile, loading, error };
}
