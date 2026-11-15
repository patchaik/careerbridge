import { useEffect } from "react";
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Protected } from "./components/routing/Protected";
import { AuthProvider } from "./context/AuthContext";
import { JourneyProvider } from "./context/JourneyContext";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { CritiquePage } from "./pages/CritiquePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { InterestsPage } from "./pages/InterestsPage";
import { LandingPage } from "./pages/LandingPage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { TargetPage } from "./pages/TargetPage";
import { SkillsPage } from "./pages/SkillsPage";
import { CoursesPage } from "./pages/CoursesPage";
import { LearnPage } from "./pages/LearnPage";
import { ProgressPage } from "./pages/ProgressPage";
import { StartPage } from "./pages/StartPage";

function AppLayout() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, search, hash]);
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
                element={<Protected><TargetPage /></Protected>}
              />
              <Route
                path="/recommendations"
                element={<Protected><RecommendationsPage /></Protected>}
              />
              <Route
                path="/skills"
                element={<Protected><SkillsPage /></Protected>}
              />

              {/* Learn */}
              <Route
                path="/courses"
                element={<Protected><CoursesPage /></Protected>}
              />
              <Route
                path="/learn"
                element={<Protected><LearnPage /></Protected>}
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
                element={<Protected><ProgressPage /></Protected>}
              />

              <Route path="*" element={<div className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-2xl font-semibold">Page not found</h1><Link className="mt-3 inline-block text-primary-700 underline" to="/">Go to CareerBridge home</Link></div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </JourneyProvider>
    </AuthProvider>
  );
}

export default App;
