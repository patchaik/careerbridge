import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/features/auth/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { MAIN_PATH, useJourney } from "../context/JourneyContext";
import { supabase } from "../lib/supabase";

// Lands here from the verification-email link (emailRedirectTo). supabase-js
// (detectSessionInUrl: true) exchanges the link's code/token for a session
// as part of client initialization — getSession() below awaits that before
// returning, so a single check is reliable without polling.
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { furthestStepIndex } = useJourney();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get("error_description") ?? params.get("error");

      const { data, error: sessionError } = await supabase.auth.getSession();
      await Promise.resolve();
      if (cancelled) return;

      if (sessionError || !data.session) {
        setError(
          urlError
            ? decodeURIComponent(urlError).replace(/\+/g, " ")
            : "This verification link is invalid or has expired. Please sign in, or request a new one.",
        );
        return;
      }
      navigate(furthestStepIndex === 0 ? "/start" : MAIN_PATH[furthestStepIndex], { replace: true });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <AuthLayout title="Verifying your email" subtitle="One moment…">
      {error ? (
        <div>
          <Alert variant="danger" title="Couldn't verify your email">
            {error}
          </Alert>
          <Link
            to="/signin"
            className="mt-5 block text-center text-sm font-medium text-primary-700 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <p className="text-center text-sm text-neutral-500">Confirming your account…</p>
      )}
    </AuthLayout>
  );
}
