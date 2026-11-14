import { analyzeInterests } from "../lib/api/interests";
import { useAsyncAction } from "./useAsync";

export function useInterestAnalysis() {
  return useAsyncAction(analyzeInterests);
}
