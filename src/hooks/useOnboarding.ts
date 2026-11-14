import { confirmProfile, parseManualSkills, parseResume } from "../lib/api/onboarding";
import { useAsyncAction } from "./useAsync";

export function useParseResume() {
  return useAsyncAction(parseResume);
}

export function useParseManualSkills() {
  return useAsyncAction(parseManualSkills);
}

export function useConfirmProfile() {
  return useAsyncAction(confirmProfile);
}
