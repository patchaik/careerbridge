import { searchJobs } from "../lib/api/jobs";
import { useAsyncAction } from "./useAsync";

export function useSearchJobs() {
  return useAsyncAction(searchJobs);
}
