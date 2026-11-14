import { Compass } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useJourney, type JourneyStepId } from "../../context/JourneyContext";
import { cn } from "../../lib/cn";

interface StepDef {
  id: JourneyStepId;
  label: string;
  to: string;
  matches: string[];
}

const steps: StepDef[] = [
  { id: "goal", label: "Goal", to: "/onboarding", matches: ["/", "/onboarding"] },
  { id: "skills", label: "Skills", to: "/skills", matches: ["/skills"] },
  { id: "arena", label: "Arena", to: "/arena", matches: ["/path", "/arena", "/assessment"] },
  { id: "progress", label: "Progress", to: "/progress", matches: ["/resume", "/progress"] },
];

export function TopNav() {
  const { unlockedSteps } = useJourney();
  const location = useLocation();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold text-neutral-900">
          <Compass className="h-5 w-5 text-primary-600" aria-hidden="true" />
          CareerBridge
        </Link>
        <nav aria-label="Journey steps">
          <ol className="flex items-center gap-1 sm:gap-2">
            {steps.map((step, i) => {
              const unlocked = unlockedSteps.has(step.id);
              const isCurrent = step.matches.some(
                (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
              );
              return (
                <li key={step.id} className="flex items-center gap-1 sm:gap-2">
                  {unlocked ? (
                    <Link
                      to={step.to}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "rounded-md px-2 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
                        isCurrent
                          ? "bg-primary-50 text-primary-700"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                      )}
                    >
                      {step.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="cursor-not-allowed rounded-md px-2 py-1 text-sm font-medium text-neutral-400"
                    >
                      {step.label}
                      <span className="sr-only"> (locked)</span>
                    </span>
                  )}
                  {i < steps.length - 1 && (
                    <span className="hidden h-px w-3 bg-neutral-300 sm:block" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </header>
  );
}
