import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { JourneyProvider } from "./context/JourneyContext";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { LandingPage } from "./pages/LandingPage";

function App() {
  return (
    <JourneyProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/onboarding/*" element={<ComingSoonPage phase="Phase 2 (Discovery)" />} />
            <Route path="/skills" element={<ComingSoonPage phase="Phase 2 (Discovery)" />} />
            <Route path="/path" element={<ComingSoonPage phase="Phase 3 (Learning)" />} />
            <Route path="/arena" element={<ComingSoonPage phase="Phase 3 (Learning)" />} />
            <Route path="/assessment" element={<ComingSoonPage phase="Phase 4 (Proof & export)" />} />
            <Route path="/resume" element={<ComingSoonPage phase="Phase 4 (Proof & export)" />} />
            <Route path="/progress" element={<ComingSoonPage phase="Phase 4 (Proof & export)" />} />
            <Route path="*" element={<ComingSoonPage phase="a later phase" />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </JourneyProvider>
  );
}

export default App;
