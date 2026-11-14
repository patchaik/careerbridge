import { Link, useLocation } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { useJourney, type JourneyStepId } from "../../context/JourneyContext";
import { cn } from "../../lib/cn";

interface GroupDef {
  id: JourneyStepId;
  label: string;
  to: string;
  matches: string[];
}

const groups: GroupDef[] = [
  { id: "profile", label: "Profile", to: "/start", matches: ["/", "/start", "/interests", "/critique"] },
  { id: "direction", label: "Direction", to: "/target", matches: ["/target", "/recommendations"] },
  { id: "skills", label: "Skills", to: "/skills", matches: ["/skills"] },
  { id: "learn", label: "Learn", to: "/courses", matches: ["/courses", "/learn", "/arena"] },
  { id: "prove", label: "Prove", to: "/assessment", matches: ["/assessment", "/resume", "/jobs"] },
  { id: "progress", label: "Progress", to: "/progress", matches: ["/progress"] },
];

export function TopNav() {
  const { unlockedSteps } = useJourney();
  const location = useLocation();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          to="/"
          className="flex-shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <Logo variant="horizontal" />
        </Link>
        <nav aria-label="Journey groups" className="overflow-x-auto">
          <ol className="flex items-center gap-1 sm:gap-2">
            {groups.map((group, i) => {
              const unlocked = unlockedSteps.has(group.id);
              const isCurrent = group.matches.some(
                (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
              );
              return (
                <li key={group.id} className="flex items-center gap-1 sm:gap-2">
                  {unlocked ? (
                    <Link
                      to={group.to}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
                        isCurrent
                          ? "bg-primary-50 text-primary-700"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                      )}
                    >
                      {group.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="cursor-not-allowed whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-neutral-400"
                    >
                      {group.label}
                      <span className="sr-only"> (locked)</span>
                    </span>
                  )}
                  {i < groups.length - 1 && (
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
