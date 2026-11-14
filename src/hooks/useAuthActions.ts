import { forgotPassword, signIn, signUp } from "../lib/api/auth";
import { useAsyncAction } from "./useAsync";

export function useSignIn() {
  return useAsyncAction(signIn);
}

export function useSignUp() {
  return useAsyncAction(signUp);
}

export function useForgotPassword() {
  return useAsyncAction(forgotPassword);
}
