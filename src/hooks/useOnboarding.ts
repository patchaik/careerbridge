import { createProfile, parseResume } from "../lib/api/onboarding";
import { useAsyncAction } from "./useAsync";

export function useParseResume() {
  return useAsyncAction(parseResume);
}

export function useCreateProfile() {
  return useAsyncAction(createProfile);
}
