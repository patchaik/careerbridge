import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SignUpInput } from "../lib/api/auth";
import type { AuthSession, AuthUser } from "../lib/types";
import { isReal } from "../lib/api/endpoints";
import { useCreateBackendUser, useForgotPassword, useSignIn, useSignUp } from "../hooks/useAuthActions";

const STORAGE_KEY = "careerbridge:auth";

interface StoredSession extends AuthSession {
  backendUserId?: string;
}

function saveSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (e.g. private browsing) — session just won't persist
  }
}

// Runs once, synchronously, before the first render: a stored session from
// back when createUser was mock (or from a broken run) has no backendUserId.
// If createUser is "real" now, that session can never send a valid
// X-User-Id — sign it out rather than let the UI limp along and fail later
// with a confusing "missing header" error from the backend.
function loadInitialAuthState(): { user: AuthUser | null; notice: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, notice: null };
    const parsed = JSON.parse(raw) as StoredSession;
    if (isReal("createUser") && !parsed?.backendUserId) {
      saveSession(null);
      return { user: null, notice: "Please sign in again." };
    }
    return { user: parsed?.user ?? null, notice: null };
  } catch {
    return { user: null, notice: null };
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  /** Throws on failure — never resolves to a signed-in state silently. */
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (fields: SignUpInput) => Promise<AuthUser>;
  forgotPassword: (email: string) => Promise<boolean>;
  signOut: () => void;
  isSigningIn: boolean;
  isSigningUp: boolean;
  isSendingReset: boolean;
  /** Set when a stale/invalid session was force-signed-out on load. */
  authNotice: string | null;
  clearAuthNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadInitialAuthState(), []);
  const [user, setUser] = useState<AuthUser | null>(initial.user);
  const [authNotice, setAuthNotice] = useState<string | null>(initial.notice);
  const signInAction = useSignIn();
  const signUpAction = useSignUp();
  const forgotPasswordAction = useForgotPassword();
  const createBackendUserAction = useCreateBackendUser();

  // Registers with the real backend (POST /api/users) first. When createUser
  // is "real", this MUST succeed before anything is considered signed in —
  // never fall back to a fake session for a real endpoint. When createUser
  // is "mock", createBackendUser always succeeds (synthesizes a local id),
  // so this never blocks pure-mock-mode sign-in.
  async function requireBackendUser(email: string, name: string | null): Promise<string> {
    const backendUser = await createBackendUserAction.run(email, name, true);
    if (!backendUser) {
      throw new Error(
        createBackendUserAction.error?.message ??
          "Couldn't reach the server to create your account. Please try again.",
      );
    }
    return backendUser.id;
  }

  async function signIn(email: string, password: string): Promise<AuthUser> {
    const backendUserId = await requireBackendUser(email, null);
    const session = await signInAction.run(email, password);
    if (!session) {
      throw new Error(signInAction.error?.message ?? "Sign in failed. Please try again.");
    }
    const stored: StoredSession = { ...session, backendUserId };
    setUser(stored.user);
    saveSession(stored);
    return stored.user;
  }

  async function signUp(fields: SignUpInput): Promise<AuthUser> {
    const backendUserId = await requireBackendUser(fields.email, fields.fullName);
    const session = await signUpAction.run(fields);
    if (!session) {
      throw new Error(signUpAction.error?.message ?? "Sign up failed. Please try again.");
    }
    const stored: StoredSession = { ...session, backendUserId };
    setUser(stored.user);
    saveSession(stored);
    return stored.user;
  }

  async function forgotPassword(email: string) {
    const result = await forgotPasswordAction.run(email);
    return result?.success === true;
  }

  function signOut() {
    // Clears the session only — journey progress persists under its own key.
    setUser(null);
    saveSession(null);
  }

  const value: AuthContextValue = {
    user,
    isSignedIn: user !== null,
    signIn,
    signUp,
    forgotPassword,
    signOut,
    isSigningIn: signInAction.isLoading || createBackendUserAction.isLoading,
    isSigningUp: signUpAction.isLoading || createBackendUserAction.isLoading,
    isSendingReset: forgotPasswordAction.isLoading,
    authNotice,
    clearAuthNotice: () => setAuthNotice(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
