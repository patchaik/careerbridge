import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AuthUser } from "../lib/types";

export interface SignUpInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
}

// Thrown by signIn specifically for an unconfirmed account, so SignInPage can
// show "Please verify your email first" + a resend button instead of a
// generic error.
export class EmailNotVerifiedError extends Error {}

function mapUser(user: User): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: typeof meta.full_name === "string" ? meta.full_name : "",
    username: typeof meta.username === "string" ? meta.username : "",
  };
}

function isUnconfirmedEmailError(error: { code?: string; message: string }): boolean {
  if (error.code === "email_not_confirmed") return true;
  return error.message.toLowerCase().includes("confirm");
}

function authErrorMessage(error: { status?: number; message: string }): string {
  if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
  const lower = error.message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Incorrect email or password.";
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "An account with this email already exists.";
  }
  return error.message || "Something went wrong. Please try again.";
}

interface AuthContextValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  /** True until the initial session check (from storage) resolves — route
   * guards should wait for this instead of treating "no user yet" as
   * "signed out". */
  isInitializing: boolean;
  /** Throws EmailNotVerifiedError for an unconfirmed account, Error otherwise. */
  signIn: (email: string, password: string) => Promise<AuthUser>;
  /** Resolves once Supabase has accepted the signup and queued a
   * verification email — never signs the user in directly. Throws on failure. */
  signUp: (fields: SignUpInput) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  isSigningIn: boolean;
  isSigningUp: boolean;
  isSendingReset: boolean;
  isResendingVerification: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      await Promise.resolve();
      if (cancelled) return;
      setUser(data.session?.user ? mapUser(data.session.user) : null);
      setIsInitializing(false);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapUser(session.user) : null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<AuthUser> {
    setIsSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (isUnconfirmedEmailError(error)) throw new EmailNotVerifiedError("Please verify your email first.");
        throw new Error(authErrorMessage(error));
      }
      if (!data.user) throw new Error("Sign in failed. Please try again.");
      const mapped = mapUser(data.user);
      setUser(mapped);
      return mapped;
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signUp(fields: SignUpInput): Promise<void> {
    setIsSigningUp(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: fields.email,
        password: fields.password,
        options: {
          data: { full_name: fields.fullName, username: fields.username, consent: true },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw new Error(authErrorMessage(error));
    } finally {
      setIsSigningUp(false);
    }
  }

  async function resendVerificationEmail(email: string): Promise<void> {
    setIsResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw new Error(authErrorMessage(error));
    } finally {
      setIsResendingVerification(false);
    }
  }

  async function forgotPassword(email: string): Promise<boolean> {
    setIsSendingReset(true);
    try {
      // Neutral regardless of outcome: never reveal whether an account
      // exists for this email, matching Supabase Auth's own anti-enumeration
      // behavior on this endpoint.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return true;
    } finally {
      setIsSendingReset(false);
    }
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    setUser(null);
  }

  const value: AuthContextValue = {
    user,
    isSignedIn: user !== null,
    isInitializing,
    signIn,
    signUp,
    resendVerificationEmail,
    forgotPassword,
    signOut,
    isSigningIn,
    isSigningUp,
    isSendingReset,
    isResendingVerification,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
