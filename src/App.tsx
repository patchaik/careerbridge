import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Protected, ProtectedBranch } from "./components/routing/Protected";
import { AuthProvider } from "./context/AuthContext";
import { JourneyProvider } from "./context/JourneyContext";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { CritiquePage } from "./pages/CritiquePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { InterestsPage } from "./pages/InterestsPage";
import { LandingPage } from "./pages/LandingPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { StartPage } from "./pages/StartPage";

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <JourneyProvider>
        <BrowserRouter>
          <Routes>
            {/* Standalone auth screens — no top nav */}
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<AppLayout />}>
              <Route path="/" element={<LandingPage />} />

              {/* Profile */}
              <Route path="/start" element={<Protected index={1}><StartPage /></Protected>} />
              <Route path="/interests" element={<Protected index={2}><InterestsPage /></Protected>} />
              <Route path="/critique" element={<Protected index={3}><CritiquePage /></Protected>} />

              {/* Direction + Skills */}
              <Route
                path="/target"
                element={<Protected index={4}><ComingSoonPage phase="Phase 4 (Direction + Skills)" /></Protected>}
              />
              <Route
                path="/recommendations"
                element={<ProtectedBranch><ComingSoonPage phase="Phase 4 (Direction + Skills)" /></ProtectedBranch>}
              />
              <Route
                path="/skills"
                element={<Protected index={5}><ComingSoonPage phase="Phase 4 (Direction + Skills)" /></Protected>}
              />

              {/* Learn */}
              <Route
                path="/courses"
                element={<Protected index={6}><ComingSoonPage phase="Phase 5 (Learn)" /></Protected>}
              />
              <Route
                path="/learn"
                element={<Protected index={7}><ComingSoonPage phase="Phase 5 (Learn)" /></Protected>}
              />
              <Route
                path="/arena"
                element={<Protected index={8}><ComingSoonPage phase="Phase 5 (Learn)" /></Protected>}
              />

              {/* Prove + Progress */}
              <Route
                path="/assessment"
                element={<Protected index={9}><ComingSoonPage phase="Phase 6 (Prove + Progress)" /></Protected>}
              />
              <Route
                path="/resume"
                element={<Protected index={10}><ComingSoonPage phase="Phase 6 (Prove + Progress)" /></Protected>}
              />
              <Route
                path="/jobs"
                element={<Protected index={11}><ComingSoonPage phase="Phase 6 (Prove + Progress)" /></Protected>}
              />
              <Route
                path="/progress"
                element={<Protected index={12}><ComingSoonPage phase="Phase 6 (Prove + Progress)" /></Protected>}
              />

              <Route path="*" element={<ComingSoonPage phase="a later phase" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </JourneyProvider>
    </AuthProvider>
  );
}

export default App;
