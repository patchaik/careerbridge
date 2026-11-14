import { getResources } from "../lib/api/resources";
import { useAsyncAction } from "./useAsync";

export function useResources() {
  return useAsyncAction(getResources);
}
