import { buildProfile, confirmProfile, parseResume } from "../lib/api/onboarding";
import { useAsyncAction } from "./useAsync";

export function useParseResume() {
  return useAsyncAction(parseResume);
}

export function useBuildProfile() {
  return useAsyncAction(buildProfile);
}

export function useConfirmProfile() {
  return useAsyncAction(confirmProfile);
}
