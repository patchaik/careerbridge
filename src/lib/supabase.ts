import { createClient } from "@supabase/supabase-js";

// The publishable key is designed to be public — safe in frontend code and
// bundles. All actual data access goes through the FastAPI backend; this
// client is used ONLY for Supabase Auth (sign up/in, password reset,
// session handling). It never queries tables directly (every table has RLS
// enabled with no public policies).
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (import.meta.env.DEV && (!url || !publishableKey)) {
  console.warn(
    "[CareerBridge] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set — " +
      "Supabase Auth calls will fail. Add them to .env (see .env.example).",
  );
}

export const supabase = createClient(url ?? "", publishableKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
