// Shared "futuristic/high-tech" visual primitives — gradient accents, glow
// shadows, and an ambient background glow — used across pages that have
// opted into this treatment (currently /start, /target and /recommendations).
// Centralized here so the look stays consistent and tweaking it once updates
// everywhere.

import { Briefcase, Building2, Laptop, MoveRight, Rocket, Target as TargetIcon, TrendingUp, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Thin gradient top accent + soft glow on hover. Apply via className on a
// Card rather than editing the shared Card component itself.
export const CARD_ACCENT =
  "relative overflow-hidden transition-shadow duration-300 hover:shadow-xl hover:shadow-primary-200/40 " +
  "before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-primary-500 before:via-accent-400 before:to-primary-600";

export const GRADIENT_HEADING = "bg-gradient-to-r from-primary-700 via-primary-600 to-accent-600 bg-clip-text text-transparent";

export type IconColor = "primary" | "success" | "warning";

// Glowing gradient badges instead of flat pastel chips.
export const ICON_BADGE_CLASSES: Record<IconColor, string> = {
  primary: "bg-gradient-to-br from-primary-500 to-accent-400 text-white shadow-[0_0_14px_-2px_rgba(79,70,229,0.55)]",
  success: "bg-gradient-to-br from-success-500 to-accent-400 text-white shadow-[0_0_14px_-2px_rgba(34,197,94,0.5)]",
  warning: "bg-gradient-to-br from-warning-500 to-danger-400 text-white shadow-[0_0_14px_-2px_rgba(245,158,11,0.5)]",
};

// Small icon badge + label, used as a section header inside a card-grouped
// page (first used on /start, now shared with /interests).
export function SectionHeading({ icon: Icon, color, children }: { icon: LucideIcon; color: IconColor; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${ICON_BADGE_CLASSES[color]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="text-sm font-semibold text-neutral-800">{children}</h2>
    </div>
  );
}

// Soft ambient glow blobs behind page content — purely decorative, sits at
// -z-10 inside a `relative` ancestor, never intercepts clicks.
export function AmbientGlow({ className = "h-[480px]" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-primary-300/25 blur-3xl" />
      <div className="absolute -top-10 right-0 h-64 w-64 rounded-full bg-accent-300/25 blur-3xl" />
      <div className="absolute top-40 left-1/3 h-56 w-56 rounded-full bg-primary-200/20 blur-3xl" />
    </div>
  );
}

// Decorative background: little "person at a laptop, pointing toward a job"
// clusters scattered behind the page content. Purely decorative
// (pointer-events-none), never affects layout or a11y. `fixed` (viewport-
// relative), not `absolute` — pages using this render their content in a
// narrow, centered max-w column, so an `absolute inset-0` here would be
// trapped inside that same narrow column instead of spreading across the
// full page.
const BACKGROUND_CLUSTERS: { top: string; left: string; rotate: number; scale: number; icon: typeof Briefcase }[] = [
  { top: "4%", left: "4%", rotate: -4, scale: 1, icon: Briefcase },
  { top: "10%", left: "80%", rotate: 6, scale: 0.85, icon: TargetIcon },
  { top: "28%", left: "12%", rotate: 3, scale: 0.95, icon: Rocket },
  { top: "34%", left: "68%", rotate: -6, scale: 1.05, icon: TrendingUp },
  { top: "52%", left: "4%", rotate: 5, scale: 0.9, icon: Building2 },
  { top: "58%", left: "82%", rotate: -3, scale: 1, icon: Briefcase },
  { top: "76%", left: "16%", rotate: 4, scale: 0.9, icon: TargetIcon },
  { top: "82%", left: "70%", rotate: -5, scale: 1, icon: Rocket },
];

export function JobIconsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <AmbientGlow className="h-full" />
      {BACKGROUND_CLUSTERS.map((c, i) => {
        const JobIcon = c.icon;
        return (
          <div
            key={i}
            className="absolute flex items-center gap-1.5 text-primary-500/[0.22]"
            style={{ top: c.top, left: c.left, transform: `rotate(${c.rotate}deg) scale(${c.scale})` }}
          >
            <UserRound className="h-8 w-8" />
            <Laptop className="h-7 w-7 -ml-2" />
            <MoveRight className="ml-1.5 h-6 w-6" />
            <JobIcon className="h-7 w-7" />
          </div>
        );
      })}
    </div>
  );
}

// Same silhouette lucide draws for its line-based icons (stroke, no fill,
// rounded joins) so these blend in next to UserRound etc. — just with wavy
// paths instead of straight ones, standing in for "text" on a screen/page.
function SquigglyLaptopIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M2 20h20" />
      <path d="M6 8c1-1 2-1 3 0s2 1 3 0 2-1 3 0 2 1 3 0" />
      <path d="M6 12c1-1 2-1 3 0s2 1 3 0 2-1 3 0" />
    </svg>
  );
}

function SquigglyPaperIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 2h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M8 8c1-1.2 2-1.2 3 0s2 1.2 3 0 2-1.2 3 0" />
      <path d="M8 12c1-1.2 2-1.2 3 0s2 1.2 3 0 2-1.2 3 0" />
      <path d="M8 16c1-1.2 2-1.2 3 0s2 1.2 3 0" />
    </svg>
  );
}

type ResumeClusterKind = "laptop" | "paper";

const RESUME_CLUSTERS: { top: string; left: string; rotate: number; scale: number; kind: ResumeClusterKind }[] = [
  { top: "5%", left: "6%", rotate: -5, scale: 1, kind: "laptop" },
  { top: "9%", left: "78%", rotate: 5, scale: 0.9, kind: "paper" },
  { top: "26%", left: "14%", rotate: 3, scale: 0.95, kind: "paper" },
  { top: "32%", left: "66%", rotate: -4, scale: 1.05, kind: "laptop" },
  { top: "50%", left: "6%", rotate: 4, scale: 0.9, kind: "paper" },
  { top: "56%", left: "80%", rotate: -3, scale: 1, kind: "laptop" },
  { top: "74%", left: "18%", rotate: 5, scale: 0.9, kind: "laptop" },
  { top: "80%", left: "68%", rotate: -5, scale: 1, kind: "paper" },
];

// Same layout as JobIconsBackground (full-viewport, same glow/opacity), but
// for the profile page: each person is paired with either their laptop
// (squiggly lines standing in for on-screen text) or a physical résumé
// (squiggly lines standing in for printed text) instead of a job arrow.
export function ResumeIconsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <AmbientGlow className="h-full" />
      {RESUME_CLUSTERS.map((c, i) => (
        <div
          key={i}
          className="absolute flex items-center gap-1.5 text-primary-500/[0.22]"
          style={{ top: c.top, left: c.left, transform: `rotate(${c.rotate}deg) scale(${c.scale})` }}
        >
          <UserRound className="h-8 w-8" />
          {c.kind === "laptop" ? (
            <SquigglyLaptopIcon className="-ml-2 h-7 w-7" />
          ) : (
            <SquigglyPaperIcon className="-ml-2 h-7 w-7" />
          )}
        </div>
      ))}
    </div>
  );
}

function SquigglyBookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 5c2-1 5-1.5 9-1.5V19c-4 0-7 .5-9 1.5V5Z" />
      <path d="M21 5c-2-1-5-1.5-9-1.5V19c4 0 7 .5 9 1.5V5Z" />
      <path d="M6 8c1-.6 2-.6 3 0" />
      <path d="M6 11.5c1-.6 2-.6 3 0" />
      <path d="M15 8c1-.6 2-.6 3 0" />
      <path d="M15 11.5c1-.6 2-.6 3 0" />
    </svg>
  );
}

// Same laptop silhouette as SquigglyLaptopIcon, but with the literal word
// "AI" on the screen instead of squiggly text lines.
function AiLaptopIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M2 20h20" />
      <text x="12" y="13.5" textAnchor="middle" fontSize="7" fontWeight="700" stroke="none" fill="currentColor">
        AI
      </text>
    </svg>
  );
}

// A little rubber-stamp badge, not an icon from the same stroke family —
// green and rotated like the other clusters, standing out just enough to
// read as "stamped" rather than blending into the line-art.
function HiredStamp({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border-2 border-success-500/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success-600/50 ${className ?? ""}`}
    >
      Hired
    </span>
  );
}

// Point A, an arrow, point B — labelled dots standing in for "learning takes
// you from where you are to where you want to be." Wider than tall, unlike
// the other icons, so it gets its own viewBox proportions.
function PointAToBIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <text x="6" y="7" textAnchor="middle" fontSize="8" fontWeight="700" stroke="none" fill="currentColor">
        A
      </text>
      <circle cx="6" cy="17" r="2.2" fill="currentColor" stroke="none" />
      <path d="M11 17h32" />
      <path d="M38 12.5l5 4.5-5 4.5" />
      <text x="50" y="7" textAnchor="middle" fontSize="8" fontWeight="700" stroke="none" fill="currentColor">
        B
      </text>
      <circle cx="50" cy="17" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type LandingClusterKind =
  | "job"
  | "resume-laptop"
  | "resume-paper"
  | "book-person"
  | "book-alone"
  | "ai-laptop"
  | "hired-stamp"
  | "point-a-b";

const LANDING_CLUSTERS: {
  top: string;
  left: string;
  rotate: number;
  scale: number;
  kind: LandingClusterKind;
  icon?: typeof Briefcase;
}[] = [
  { top: "3%", left: "3%", rotate: -4, scale: 1, kind: "job", icon: Briefcase },
  { top: "6%", left: "85%", rotate: 5, scale: 0.9, kind: "resume-laptop" },
  { top: "9%", left: "30%", rotate: 6, scale: 0.9, kind: "resume-paper" },
  { top: "14%", left: "46%", rotate: -8, scale: 1, kind: "hired-stamp" },
  { top: "20%", left: "10%", rotate: 4, scale: 0.95, kind: "book-person" },
  { top: "24%", left: "70%", rotate: -5, scale: 1, kind: "job", icon: TargetIcon },
  { top: "30%", left: "92%", rotate: 3, scale: 0.9, kind: "book-alone" },
  { top: "36%", left: "4%", rotate: -4, scale: 1, kind: "ai-laptop" },
  { top: "42%", left: "55%", rotate: 6, scale: 0.85, kind: "resume-paper" },
  { top: "48%", left: "82%", rotate: -10, scale: 1, kind: "hired-stamp" },
  { top: "55%", left: "15%", rotate: 4, scale: 0.9, kind: "job", icon: Rocket },
  { top: "60%", left: "62%", rotate: -5, scale: 0.95, kind: "resume-laptop" },
  { top: "66%", left: "90%", rotate: 3, scale: 1, kind: "book-person" },
  { top: "72%", left: "6%", rotate: -4, scale: 0.9, kind: "ai-laptop" },
  { top: "78%", left: "48%", rotate: 7, scale: 0.85, kind: "book-alone" },
  { top: "84%", left: "76%", rotate: -3, scale: 1, kind: "job", icon: Building2 },
  { top: "90%", left: "22%", rotate: 9, scale: 0.9, kind: "hired-stamp" },
  { top: "94%", left: "60%", rotate: -6, scale: 0.9, kind: "resume-paper" },
  { top: "12%", left: "62%", rotate: 2, scale: 1, kind: "point-a-b" },
  { top: "38%", left: "28%", rotate: -3, scale: 0.95, kind: "point-a-b" },
  { top: "68%", left: "40%", rotate: 3, scale: 0.9, kind: "point-a-b" },
];

// For the landing/about page: the widest mix, combining every motif used
// elsewhere (job arrows, résumé text, books, "AI" laptops) plus green
// "Hired" stamps, scattered across the full page since this page scrolls
// much taller than a single viewport.
export function LandingIconsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <AmbientGlow className="h-full" />
      {LANDING_CLUSTERS.map((c, i) => {
        const wrapperStyle = { top: c.top, left: c.left, transform: `rotate(${c.rotate}deg) scale(${c.scale})` };

        if (c.kind === "hired-stamp") {
          return (
            <div key={i} className="absolute" style={wrapperStyle}>
              <HiredStamp />
            </div>
          );
        }

        if (c.kind === "book-alone") {
          return (
            <div key={i} className="absolute text-primary-500/[0.22]" style={wrapperStyle}>
              <SquigglyBookIcon className="h-8 w-8" />
            </div>
          );
        }

        if (c.kind === "point-a-b") {
          return (
            <div key={i} className="absolute text-primary-500/[0.22]" style={wrapperStyle}>
              <PointAToBIcon className="h-7 w-16" />
            </div>
          );
        }

        if (c.kind === "job") {
          const JobIcon = c.icon ?? Briefcase;
          return (
            <div key={i} className="absolute flex items-center gap-1.5 text-primary-500/[0.22]" style={wrapperStyle}>
              <UserRound className="h-8 w-8" />
              <Laptop className="h-7 w-7 -ml-2" />
              <MoveRight className="ml-1.5 h-6 w-6" />
              <JobIcon className="h-7 w-7" />
            </div>
          );
        }

        if (c.kind === "book-person") {
          return (
            <div key={i} className="absolute flex items-center gap-1.5 text-primary-500/[0.22]" style={wrapperStyle}>
              <UserRound className="h-8 w-8" />
              <SquigglyBookIcon className="-ml-2 h-7 w-7" />
            </div>
          );
        }

        if (c.kind === "ai-laptop") {
          return (
            <div key={i} className="absolute flex items-center gap-1.5 text-primary-500/[0.22]" style={wrapperStyle}>
              <UserRound className="h-8 w-8" />
              <AiLaptopIcon className="-ml-2 h-7 w-7" />
            </div>
          );
        }

        return (
          <div key={i} className="absolute flex items-center gap-1.5 text-primary-500/[0.22]" style={wrapperStyle}>
            <UserRound className="h-8 w-8" />
            {c.kind === "resume-laptop" ? (
              <SquigglyLaptopIcon className="-ml-2 h-7 w-7" />
            ) : (
              <SquigglyPaperIcon className="-ml-2 h-7 w-7" />
            )}
          </div>
        );
      })}
    </div>
  );
}

const POINT_A_B_CLUSTERS: { top: string; left: string; rotate: number; scale: number }[] = [
  { top: "5%", left: "8%", rotate: -3, scale: 1 },
  { top: "11%", left: "78%", rotate: 4, scale: 0.9 },
  { top: "24%", left: "40%", rotate: 2, scale: 0.85 },
  { top: "34%", left: "90%", rotate: -5, scale: 1 },
  { top: "46%", left: "14%", rotate: 3, scale: 0.9 },
  { top: "56%", left: "62%", rotate: -2, scale: 0.95 },
  { top: "68%", left: "6%", rotate: 5, scale: 0.9 },
  { top: "78%", left: "82%", rotate: -4, scale: 1 },
  { top: "90%", left: "36%", rotate: 3, scale: 0.9 },
];

type LearnClusterKind = "book" | "ai-laptop";

const LEARN_CLUSTERS: { top: string; left: string; rotate: number; scale: number; kind: LearnClusterKind }[] = [
  { top: "4%", left: "6%", rotate: -4, scale: 1, kind: "book" },
  { top: "8%", left: "84%", rotate: 5, scale: 0.9, kind: "ai-laptop" },
  { top: "22%", left: "46%", rotate: -3, scale: 0.9, kind: "book" },
  { top: "30%", left: "12%", rotate: 4, scale: 0.95, kind: "ai-laptop" },
  { top: "38%", left: "88%", rotate: -5, scale: 1, kind: "book" },
  { top: "50%", left: "60%", rotate: 3, scale: 0.9, kind: "ai-laptop" },
  { top: "60%", left: "8%", rotate: -4, scale: 0.95, kind: "book" },
  { top: "70%", left: "80%", rotate: 4, scale: 1, kind: "ai-laptop" },
  { top: "80%", left: "40%", rotate: -3, scale: 0.9, kind: "book" },
  { top: "92%", left: "64%", rotate: 5, scale: 0.9, kind: "ai-laptop" },
];

// Same layout as the other page backgrounds, but for the Learn page: just
// books (squiggly lines standing in for course material) and "AI" laptops,
// standalone — no person icon.
export function LearnIconsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <AmbientGlow className="h-full" />
      {LEARN_CLUSTERS.map((c, i) => (
        <div
          key={i}
          className="absolute text-primary-500/[0.22]"
          style={{ top: c.top, left: c.left, transform: `rotate(${c.rotate}deg) scale(${c.scale})` }}
        >
          {c.kind === "book" ? <SquigglyBookIcon className="h-8 w-8" /> : <AiLaptopIcon className="h-8 w-8" />}
        </div>
      ))}
    </div>
  );
}

// Same layout as the other page backgrounds, but for the Skills page: only
// the "A → B" learning-journey icon from the landing page, repeated.
export function SkillsIconsBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <AmbientGlow className="h-full" />
      {POINT_A_B_CLUSTERS.map((c, i) => (
        <div
          key={i}
          className="absolute text-primary-500/[0.22]"
          style={{ top: c.top, left: c.left, transform: `rotate(${c.rotate}deg) scale(${c.scale})` }}
        >
          <PointAToBIcon className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
