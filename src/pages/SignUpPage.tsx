import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/features/auth/AuthLayout";
import { CaptchaModal } from "../components/features/auth/CaptchaModal";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { useAuth } from "../context/AuthContext";
import { isValidEmail, isValidUsername } from "../lib/validation";

interface FormErrors {
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function SignUpPage() {
  const navigate = useNavigate();
  const { signUp, isSigningUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [captchaOpen, setCaptchaOpen] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!fullName.trim()) next.fullName = "Full name is required.";
    if (!username.trim()) next.username = "Username is required.";
    else if (!isValidUsername(username)) {
      next.username = "3–20 characters: letters, numbers, and underscores only.";
    }
    if (!email.trim()) next.email = "Email is required.";
    else if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    else if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (!confirmPassword) next.confirmPassword = "Please confirm your password.";
    else if (confirmPassword !== password) next.confirmPassword = "Passwords don't match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (validate()) setCaptchaOpen(true);
  }

  async function handleVerified() {
    setCaptchaOpen(false);
    const user = await signUp({ fullName, username, email, password });
    if (user) navigate("/start");
  }

  return (
    <AuthLayout title="Create account" subtitle="Join CareerBridge to start building your future">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="signup-name"
          label="Full name"
          value={fullName}
          onChange={setFullName}
          error={errors.fullName}
          required
          autoComplete="name"
        />
        <TextField
          id="signup-username"
          label="Username"
          value={username}
          onChange={setUsername}
          error={errors.username}
          required
          autoComplete="username"
        />
        <TextField
          id="signup-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          required
          autoComplete="email"
        />
        <TextField
          id="signup-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          error={errors.password}
          required
          autoComplete="new-password"
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
        <TextField
          id="signup-confirm-password"
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={errors.confirmPassword}
          required
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full" disabled={isSigningUp}>
          {isSigningUp ? "Creating account…" : "Sign up"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link to="/signin" className="font-medium text-primary-700 hover:underline">
          Sign in
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
