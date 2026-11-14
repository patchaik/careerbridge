import { createGoal } from "../lib/api/goals";
import { useAsyncAction } from "./useAsync";

export function useCreateGoal() {
  return useAsyncAction(createGoal);
}
