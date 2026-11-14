import { useCallback, useState } from "react";
import { ApiError } from "../lib/api/client";

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: ApiError | Error | null;
}

export interface UseAsyncActionResult<Args extends unknown[], T> extends AsyncState<T> {
  run: (...args: Args) => Promise<T | undefined>;
  reset: () => void;
}

// Wraps an on-demand API call (POST/PUT-style action) with loading/error/data state.
// `fn` should be a stable reference (a module-level function from src/lib/api/*.ts).
export function useAsyncAction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
): UseAsyncActionResult<Args, T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, isLoading: false, error: null });

  const run = useCallback(
    async (...args: Args) => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const data = await fn(...args);
        setState({ data, isLoading: false, error: null });
        return data;
      } catch (error) {
        setState({
          data: null,
          isLoading: false,
          error: error instanceof Error ? error : new Error("Unknown error"),
        });
        return undefined;
      }
    },
    [fn],
  );

  const reset = useCallback(() => setState({ data: null, isLoading: false, error: null }), []);

  return { ...state, run, reset };
}
