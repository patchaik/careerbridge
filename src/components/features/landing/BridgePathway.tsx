// The landing page's visual metaphor: a suspension bridge whose deck stops
// are the journey's screens, from "You are here" to "Your next career".
// Desktop renders an SVG bridge with stops standing on the deck; mobile
// collapses to a vertical path. Each stop shows an icon + short label, with
// the one-line description surfaced only on hover/focus (tooltip).

import {
  Briefcase,
  ClipboardCheck,
  Dumbbell,
  FileSearch,
  GitCompare,
  GraduationCap,
  Lightbulb,
  type LucideIcon,
  BookOpen,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/cn";

interface Stop {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  to: string;
}

const mainStops: Stop[] = [
  { id: "upload", label: "Upload résumé", description: "Share your résumé or enter skills.", icon: Upload, to: "/start" },
  { id: "interests", label: "Your interests", description: "AI finds your strengths and interests; you pick skills to build on.", icon: Sparkles, to: "/interests" },
  { id: "critique", label: "Résumé critique", description: "Section-by-section feedback on your résumé.", icon: FileSearch, to: "/critique" },
  { id: "target", label: "Target role", description: "Choose a role and see its AI & market outlook.", icon: Target, to: "/target" },
  { id: "gap", label: "Skill gap", description: "What you have vs. what the market asks for.", icon: GitCompare, to: "/skills" },
  { id: "courses", label: "Courses", description: "5 free and 5 paid picks for your gap.", icon: BookOpen, to: "/courses" },
  { id: "learn", label: "Learn", description: "An AI tutor teaches the missing skill.", icon: GraduationCap, to: "/learn" },
  { id: "arena", label: "Build Arena", description: "Hands-on practice and quizzes.", icon: Dumbbell, to: "/arena" },
  { id: "prove", label: "Prove it", description: "Independent assessment and a verified résumé update.", icon: ClipboardCheck, to: "/assessment" },
  { id: "jobs", label: "Job matches", description: "Roles you're now ready for.", icon: Briefcase, to: "/jobs" },
];

const branchStop: Stop = {
  id: "ideas",
  label: "Role ideas",
  description: "Not sure? Get roles that match your skills.",
  icon: Lightbulb,
  to: "/recommendations",
};

const BRANCH_AFTER_ID = "target";

function Tooltip({ id, text, side }: { id: string; text: string; side: "top" | "right" }) {
  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 w-44 rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        side === "top" && "bottom-full left-1/2 mb-2 -translate-x-1/2",
        side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
      )}
    >
      {text}
    </div>
  );
}

function StopMarker({
  stop,
  tooltipSide,
  small = false,
  dashed = false,
}: {
  stop: Stop;
  tooltipSide: "top" | "right";
  small?: boolean;
  dashed?: boolean;
}) {
  const tooltipId = `bridge-tip-${stop.id}`;
  const Icon = stop.icon;
  return (
    <div className="group relative flex flex-col items-center text-center">
      <Link
        to={stop.to}
        aria-describedby={tooltipId}
        className="flex flex-col items-center gap-1.5 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full border-2 bg-white text-brand-700 shadow-sm transition-colors group-hover:border-brand-600",
            small ? "h-8 w-8" : "h-10 w-10",
            dashed ? "border-dashed border-brand-300" : "border-brand-400",
          )}
        >
          <Icon className={small ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        </span>
        <span
          className={cn(
            "max-w-[5.5rem] font-medium leading-tight text-neutral-800 sm:max-w-[6.5rem]",
            small ? "text-[10px]" : "text-[11px] sm:text-xs",
          )}
        >
          {stop.label}
        </span>
      </Link>
      <Tooltip id={tooltipId} text={stop.description} side={tooltipSide} />
    </div>
  );
}

function WalkingDot({ axis }: { axis: "x" | "y" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute hidden h-3 w-3 rounded-full bg-primary-600 shadow motion-safe:block motion-safe:[animation-fill-mode:forwards]",
        axis === "x"
          ? "bottom-[20%] -translate-x-1/2 translate-y-1/2 motion-safe:animate-[bridge-walk-x_5s_ease-in-out_1]"
          : "left-0 -translate-x-1/2 -translate-y-1/2 motion-safe:animate-[bridge-walk-y_5s_ease-in-out_1]",
      )}
    />
  );
}

function DesktopBridge() {
  return (
    <div className="relative hidden h-[380px] w-full md:block">
      <svg
        viewBox="0 0 1000 260"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        {/* banks */}
        <rect x="0" y="218" width="150" height="42" fill="var(--color-neutral-200)" />
        <rect x="850" y="218" width="150" height="42" fill="var(--color-neutral-200)" />

        {/* main cable */}
        <path
          d="M20,204 C90,100 120,40 159,40 C260,40 260,140 500,140 C740,140 740,40 841,40 C880,40 910,100 980,204"
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* suspenders */}
        {[
          [220, 70],
          [290, 100],
          [360, 120],
          [430, 132],
          [570, 132],
          [640, 120],
          [710, 100],
          [780, 70],
        ].map(([x, y]) => (
          <line key={x} x1={x} y1={y} x2={x} y2="204" stroke="var(--color-brand-300)" strokeWidth="2" />
        ))}

        {/* towers */}
        <rect x="150" y="40" width="18" height="164" fill="var(--color-brand-700)" />
        <rect x="832" y="40" width="18" height="164" fill="var(--color-brand-700)" />

        {/* deck */}
        <rect x="20" y="204" width="960" height="14" rx="2" fill="var(--color-brand-700)" />
      </svg>

      <WalkingDot axis="x" />

      <span className="absolute bottom-[8%] left-2 text-xs font-medium text-neutral-500">You are here</span>
      <span className="absolute bottom-[8%] right-2 text-xs font-medium text-neutral-500">Your next career</span>

      <div className="absolute inset-x-10 bottom-[20%] flex items-end justify-between">
        {mainStops.map((stop) => (
          <div key={stop.id} className="relative flex flex-col items-center">
            <StopMarker stop={stop} tooltipSide="top" />
            {stop.id === BRANCH_AFTER_ID && (
              <div className="absolute left-1/2 top-full flex -translate-x-1/2 flex-col items-center pt-1">
                <span className="h-3 w-px border-l border-dashed border-brand-300" aria-hidden="true" />
                <StopMarker stop={branchStop} tooltipSide="top" small dashed />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileBridge() {
  return (
    <div className="relative mx-auto flex max-w-xs flex-col md:hidden">
      <p className="mb-3 text-xs font-medium text-neutral-500">You are here</p>
      <ol className="relative flex flex-col gap-5 border-l-2 border-brand-200 pl-6">
        <WalkingDot axis="y" />
        {mainStops.map((stop) => (
          <li key={stop.id} className="relative flex flex-col gap-3">
            <StopMarker stop={stop} tooltipSide="right" />
            {stop.id === BRANCH_AFTER_ID && (
              <div className="ml-2 flex items-center gap-2 border-l-2 border-dashed border-brand-200 pl-4">
                <StopMarker stop={branchStop} tooltipSide="right" small dashed />
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs font-medium text-neutral-500">Your next career</p>
    </div>
  );
}

export function BridgePathway() {
  return (
    <div>
      <DesktopBridge />
      <MobileBridge />
    </div>
  );
}
