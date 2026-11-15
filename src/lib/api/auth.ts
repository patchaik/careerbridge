import type { AuthSession } from "../types";
import { isReal } from "./endpoints";
import { mockForgotPassword, mockSignIn, mockSignUp } from "../mock/handlers";
import { apiRequest } from "./client";

// Password/username auth stays UI-only for now — api/openapi.yaml's MVP auth
// is just X-User-Id (see createBackendUser below). See docs/INTEGRATION_NOTES.md.
export async function signIn(email: string, password: string): Promise<AuthSession> {
  if (isReal("signIn")) {
    return apiRequest<AuthSession>("/api/auth/signin", { method: "POST", body: { email, password } });
  }
  return mockSignIn(email);
}

export interface SignUpInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
}

export async function signUp(fields: SignUpInput): Promise<AuthSession> {
  if (isReal("signUp")) {
    return apiRequest<AuthSession>("/api/auth/signup", { method: "POST", body: fields });
  }
  return mockSignUp(fields);
}

export async function forgotPassword(email: string): Promise<{ success: true }> {
  if (isReal("forgotPassword")) {
    return apiRequest<{ success: true }>("/api/auth/forgot-password", { method: "POST", body: { email } });
  }
  return mockForgotPassword();
}

export interface BackendUser {
  id: string;
  email: string;
  name: string | null;
}

// POST /api/users — real backend sign-in/create-by-email, used alongside
// (not instead of) the mock signIn/signUp above so X-User-Id has a real
// value to send. See docs/INTEGRATION_NOTES.md for why these are separate.
export async function createBackendUser(email: string, name: string | null, consent: boolean): Promise<BackendUser> {
  if (!isReal("createUser")) {
    // Pure mock mode: no backend is expected to be running. Synthesize an id
    // so X-User-Id has a (harmless, unused) value either way.
    return { id: `local_${crypto.randomUUID()}`, email, name };
  }
  return apiRequest<BackendUser>("/api/users", {
    method: "POST",
    skipAuth: true,
    body: { email, name, consent },
  });
}
