// "How it works": five stage cards in journey order, connected by one thin
// arched line on desktop (the only bridge reference, intentionally subtle)
// and a plain vertical timeline on mobile.

import { Compass, GitCompare, GraduationCap, UserRound, type LucideIcon, BadgeCheck } from "lucide-react";

interface Stage {
  n: number;
  name: string;
  line: string;
  icon: LucideIcon;
}

const stages: Stage[] = [
  { n: 1, name: "Profile", line: "Upload résumé · Interests · Résumé critique · Learning morale", icon: UserRound },
  { n: 2, name: "Direction", line: "Target role & AI outlook · Role ideas", icon: Compass },
  { n: 3, name: "Skills", line: "Skill gap analysis", icon: GitCompare },
  { n: 4, name: "Learn", line: "Courses · AI tutor · Build Arena", icon: GraduationCap },
  { n: 5, name: "Prove", line: "Assessment · Verified résumé · Job matches", icon: BadgeCheck },
];

function StageCard({ stage }: { stage: Stage }) {
  const Icon = stage.icon;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
          {stage.n}
        </span>
        <Icon className="h-4 w-4 text-primary-600" aria-hidden="true" />
      </div>
      <p className="mt-2.5 text-sm font-semibold text-neutral-900">{stage.name}</p>
      <p className="mt-1 text-xs leading-snug text-neutral-500">{stage.line}</p>
    </div>
  );
}

export function JourneyStepper() {
  return (
    <div>
      {/* Desktop: arched connector + evenly spaced cards. Tablet/mobile keep the roomier vertical timeline. */}
      <div className="relative hidden lg:block">
        <svg
          viewBox="0 0 1000 32"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute -top-5 left-0 h-6 w-full"
        >
          <path
            d="M20,28 Q500,-4 980,28"
            fill="none"
            stroke="var(--color-neutral-300)"
            strokeWidth="1.5"
          />
        </svg>
        <div className="grid grid-cols-5 gap-4 md:gap-6">
          {stages.map((stage) => (
            <StageCard key={stage.n} stage={stage} />
          ))}
        </div>
      </div>

      {/* Tablet / mobile: vertical timeline */}
      <ol className="relative flex flex-col gap-4 border-l border-neutral-200 pl-5 lg:hidden">
        {stages.map((stage) => (
          <li key={stage.n} className="relative">
            <span
              className="absolute -left-[26px] top-3 h-2 w-2 rounded-full bg-primary-400"
              aria-hidden="true"
            />
            <StageCard stage={stage} />
          </li>
        ))}
      </ol>
    </div>
  );
}
