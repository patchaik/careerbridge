import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/features/auth/AuthLayout";
import { CaptchaModal } from "../components/features/auth/CaptchaModal";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { EmailNotVerifiedError, useAuth } from "../context/AuthContext";
import { MAIN_PATH, useJourney } from "../context/JourneyContext";
import { isValidEmail } from "../lib/validation";

interface FormErrors {
  email?: string;
  password?: string;
}

export function SignInPage() {
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  const { signIn, isSigningIn, resendVerificationEmail, isResendingVerification } = useAuth();
  const { furthestStepIndex } = useJourney();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!email.trim()) next.email = "Email is required.";
    else if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setUnverifiedEmail(null);
    setResendSent(false);
    if (validate()) setCaptchaOpen(true);
  }

  async function handleVerified() {
    setCaptchaOpen(false);
    try {
      await signIn(email, password);
      const isKnownPage = [...MAIN_PATH, "/recommendations"].includes(from?.pathname);
      navigate(isKnownPage ? {
        pathname: from.pathname,
        search: typeof from.search === "string" ? from.search : "",
        hash: typeof from.hash === "string" ? from.hash : "",
      } : furthestStepIndex === 0 ? "/start" : MAIN_PATH[furthestStepIndex], { replace: true });
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        setUnverifiedEmail(email);
      } else {
        setAuthError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
      }
    }
  }

  async function handleResend() {
    if (!unverifiedEmail) return;
    setResendSent(false);
    try {
      await resendVerificationEmail(unverifiedEmail);
      setResendSent(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Couldn't resend the email. Please try again.");
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to CareerBridge">
      {unverifiedEmail && (
        <Alert variant="warning" className="mb-4" title="Please verify your email first">
          Check your inbox for a verification link, or{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={isResendingVerification}
            className="font-medium underline hover:text-warning-900 disabled:no-underline"
          >
            {isResendingVerification ? "resending…" : "resend the email"}
          </button>
          .{resendSent && " Sent — check your inbox."}
        </Alert>
      )}
      {authError && (
        <Alert variant="danger" className="mb-4" title="Couldn't sign in">
          {authError}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="signin-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          required
          autoComplete="email"
        />
        <TextField
          id="signin-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          error={errors.password}
          required
          autoComplete="current-password"
          labelRightSlot={
            <Link to="/forgot-password" className="text-xs font-medium text-primary-700 hover:underline">
              Forgot password?
            </Link>
          }
          inputRightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="text-neutral-400 hover:text-neutral-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Button type="submit" className="w-full" disabled={isSigningIn}>
          {isSigningIn ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-neutral-500">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-primary-700 hover:underline">
          Sign up
        </Link>
      </p>

      <CaptchaModal
        isOpen={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        onVerified={handleVerified}
      />
    </AuthLayout>
  );
}
