import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/features/auth/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { MAIN_PATH, useJourney } from "../context/JourneyContext";
import { supabase } from "../lib/supabase";

interface FormErrors {
  password?: string;
  confirmPassword?: string;
}

// Lands here from the password-reset email link. The recovery link already
// establishes an authenticated session on load (detectSessionInUrl), so
// updateUser({ password }) below both sets the new password AND leaves the
// user signed in to continue their journey — no separate sign-in step needed.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { furthestStepIndex } = useJourney();

  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      await Promise.resolve();
      if (cancelled) return;
      setLinkValid(Boolean(data.session));
      setCheckingLink(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!password) next.password = "Password is required.";
    else if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (!confirmPassword) next.confirmPassword = "Please confirm your password.";
    else if (confirmPassword !== password) next.confirmPassword = "Passwords don't match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      navigate(furthestStepIndex === 0 ? "/start" : MAIN_PATH[furthestStepIndex], { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't reset your password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkingLink) {
    return (
      <AuthLayout title="Set a new password" subtitle="One moment…">
        <p className="text-center text-sm text-neutral-500">Checking your link…</p>
      </AuthLayout>
    );
  }

  if (!linkValid) {
    return (
      <AuthLayout title="Set a new password" subtitle="This link is invalid or has expired">
        <Alert variant="danger">Request a new password reset link to continue.</Alert>
        <Link
          to="/forgot-password"
          className="mt-5 block text-center text-sm font-medium text-primary-700 hover:underline"
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a new password for your account">
      {submitError && (
        <Alert variant="danger" className="mb-4" title="Couldn't reset your password">
          {submitError}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="reset-password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          required
          autoComplete="new-password"
        />
        <TextField
          id="reset-confirm-password"
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={errors.confirmPassword}
          required
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
