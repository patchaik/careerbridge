import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/features/auth/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { useAuth } from "../context/AuthContext";
import { isValidEmail } from "../lib/validation";

export function ForgotPasswordPage() {
  const { forgotPassword, isSendingReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    const ok = await forgotPassword(email);
    if (ok) setSent(true);
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to get back in">
      {sent ? (
        <div>
          <Alert variant="success">
            If an account exists for that email, we've sent a reset link.
          </Alert>
          <Link
            to="/signin"
            className="mt-5 block text-center text-sm font-medium text-primary-700 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <TextField
            id="forgot-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            error={error}
            required
            autoComplete="email"
          />
          <Button type="submit" className="w-full" disabled={isSendingReset}>
            {isSendingReset ? "Sending…" : "Send reset link"}
          </Button>
          <Link
            to="/signin"
            className="block text-center text-sm font-medium text-primary-700 hover:underline"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
