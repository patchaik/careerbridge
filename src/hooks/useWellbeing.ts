import { submitCheckIn } from "../lib/api/wellbeing";
import { useAsyncAction } from "./useAsync";

export function useWellbeingCheckIn() {
  return useAsyncAction(submitCheckIn);
}
