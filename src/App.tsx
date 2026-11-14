import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { JourneyProvider } from "./context/JourneyContext";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { CritiquePage } from "./pages/CritiquePage";
import { InterestsPage } from "./pages/InterestsPage";
import { LandingPage } from "./pages/LandingPage";
import { StartPage } from "./pages/StartPage";

function App() {
  return (
    <JourneyProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<LandingPage />} />

            {/* Profile */}
            <Route path="/start" element={<StartPage />} />
            <Route path="/interests" element={<InterestsPage />} />
            <Route path="/critique" element={<CritiquePage />} />

            {/* Direction + Skills */}
            <Route path="/target" element={<ComingSoonPage phase="Phase 4 (Direction + Skills)" />} />
            <Route path="/recommendations" element={<ComingSoonPage phase="Phase 4 (Direction + Skills)" />} />
            <Route path="/skills" element={<ComingSoonPage phase="Phase 4 (Direction + Skills)" />} />

            {/* Learn */}
            <Route path="/courses" element={<ComingSoonPage phase="Phase 5 (Learn)" />} />
            <Route path="/learn" element={<ComingSoonPage phase="Phase 5 (Learn)" />} />
            <Route path="/arena" element={<ComingSoonPage phase="Phase 5 (Learn)" />} />

            {/* Prove + Progress */}
            <Route path="/assessment" element={<ComingSoonPage phase="Phase 6 (Prove + Progress)" />} />
            <Route path="/resume" element={<ComingSoonPage phase="Phase 6 (Prove + Progress)" />} />
            <Route path="/jobs" element={<ComingSoonPage phase="Phase 6 (Prove + Progress)" />} />
            <Route path="/progress" element={<ComingSoonPage phase="Phase 6 (Prove + Progress)" />} />

            <Route path="*" element={<ComingSoonPage phase="a later phase" />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </JourneyProvider>
  );
}

export default App;
