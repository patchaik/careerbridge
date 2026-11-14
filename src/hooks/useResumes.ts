import { draftResume, exportResume } from "../lib/api/resumes";
import { useAsyncAction } from "./useAsync";

export function useResumeDraft() {
  return useAsyncAction(draftResume);
}

export function useResumeExport() {
  return useAsyncAction(exportResume);
}
