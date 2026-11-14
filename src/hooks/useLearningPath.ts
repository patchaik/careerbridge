import { generatePath } from "../lib/api/paths";
import { useAsyncAction } from "./useAsync";

export function useLearningPath() {
  return useAsyncAction(generatePath);
}
