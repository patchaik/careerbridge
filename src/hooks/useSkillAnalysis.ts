import { analyzeSkills } from "../lib/api/skills";
import { useAsyncAction } from "./useAsync";

export function useSkillAnalysis() {
  return useAsyncAction(analyzeSkills);
}
