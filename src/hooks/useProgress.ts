import { getProgress } from "../lib/api/progress";
import { useAsyncAction } from "./useAsync";

export function useProgress() {
  return useAsyncAction(getProgress);
}
