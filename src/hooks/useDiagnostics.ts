import { startDiagnostic } from "../lib/api/diagnostics";
import { useAsyncAction } from "./useAsync";

export function useDiagnostic() {
  return useAsyncAction(startDiagnostic);
}
