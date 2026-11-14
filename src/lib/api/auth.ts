import { USE_MOCKS } from "../config";
import type { AuthSession } from "../types";
import { mockForgotPassword, mockSignIn, mockSignUp } from "../mock/handlers";
import { apiRequest } from "./client";

export async function signIn(email: string, password: string): Promise<AuthSession> {
  if (USE_MOCKS) return mockSignIn(email);
  return apiRequest<AuthSession>("/auth/signin", { method: "POST", body: { email, password } });
}

export interface SignUpInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
}

export async function signUp(fields: SignUpInput): Promise<AuthSession> {
  if (USE_MOCKS) return mockSignUp(fields);
  return apiRequest<AuthSession>("/auth/signup", { method: "POST", body: fields });
}

export async function forgotPassword(email: string): Promise<{ success: true }> {
  if (USE_MOCKS) return mockForgotPassword();
  return apiRequest<{ success: true }>("/auth/forgot-password", { method: "POST", body: { email } });
}
