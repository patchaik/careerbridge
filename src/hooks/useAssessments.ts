import { submitAssessment } from "../lib/api/assessments";
import { useAsyncAction } from "./useAsync";

export function useSubmitAssessment() {
  return useAsyncAction(submitAssessment);
}
