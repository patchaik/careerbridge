import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export interface ProgressStepItem {
  id: string;
  label: string;
  status: "complete" | "current" | "upcoming" | "locked";
}

export function ProgressSteps({ steps }: { steps: ProgressStepItem[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Journey progress">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
              step.status === "complete" && "border-success-600 bg-success-600 text-white",
              step.status === "current" && "border-primary-600 bg-primary-600 text-white",
              step.status === "upcoming" && "border-neutral-300 bg-white text-neutral-500",
              step.status === "locked" && "border-neutral-200 bg-neutral-100 text-neutral-400",
            )}
            aria-hidden="true"
          >
            {step.status === "complete" ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span
            className={cn(
              "text-sm",
              step.status === "current" && "font-semibold text-neutral-900",
              step.status === "complete" && "text-neutral-700",
              (step.status === "upcoming" || step.status === "locked") && "text-neutral-400",
            )}
          >
            {step.label}
            {step.status === "locked" && <span className="sr-only"> (locked)</span>}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-neutral-300" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
