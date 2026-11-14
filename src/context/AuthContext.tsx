import { createContext, useContext, useState, type ReactNode } from "react";
import type { SignUpInput } from "../lib/api/auth";
import type { AuthSession, AuthUser } from "../lib/types";
import { useForgotPassword, useSignIn, useSignUp } from "../hooks/useAuthActions";

const STORAGE_KEY = "careerbridge:auth";

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.user ?? null;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (e.g. private browsing) — session just won't persist
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser | undefined>;
  signUp: (fields: SignUpInput) => Promise<AuthUser | undefined>;
  forgotPassword: (email: string) => Promise<boolean>;
  signOut: () => void;
  isSigningIn: boolean;
  isSigningUp: boolean;
  isSendingReset: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);
  const signInAction = useSignIn();
  const signUpAction = useSignUp();
  const forgotPasswordAction = useForgotPassword();

  async function signIn(email: string, password: string) {
    const session = await signInAction.run(email, password);
    if (session) {
      setUser(session.user);
      saveSession(session);
      return session.user;
    }
    return undefined;
  }

  async function signUp(fields: SignUpInput) {
    const session = await signUpAction.run(fields);
    if (session) {
      setUser(session.user);
      saveSession(session);
      return session.user;
    }
    return undefined;
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
    isSigningIn: signInAction.isLoading,
    isSigningUp: signUpAction.isLoading,
    isSendingReset: forgotPasswordAction.isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
