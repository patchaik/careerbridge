import { ClipboardCheck, FileCheck2, GraduationCap, Search, Target } from "lucide-react";
import { Link } from "react-router-dom";

const journeySteps = [
  { icon: Target, label: "Target a job", description: "Pick the role you actually want next." },
  { icon: Search, label: "Identify a real gap", description: "See which skills the market asks for, backed by evidence." },
  { icon: GraduationCap, label: "Learn and practice", description: "Work through a focused path with hands-on practice." },
  { icon: ClipboardCheck, label: "Prove competence", description: "Demonstrate it in an independent assessment, not a quiz you wrote." },
  { icon: FileCheck2, label: "Approve the update", description: "Review and approve a truthful résumé addition." },
];

export function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          CareerBridge
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
          Target a job. Find a real skill gap. Learn and practice. Demonstrate mastery.
          Carry verified evidence forward.
        </p>
        <Link
          to="/onboarding"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          Get started
        </Link>
      </div>

      <ol className="mt-16 grid gap-4 sm:grid-cols-5">
        {journeySteps.map((step, i) => (
          <li
            key={step.label}
            className="rounded-xl border border-neutral-200 bg-white p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {i + 1}
              </span>
              <step.icon className="h-4 w-4 text-primary-600" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-semibold text-neutral-900">{step.label}</p>
            <p className="mt-1 text-sm text-neutral-600">{step.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
