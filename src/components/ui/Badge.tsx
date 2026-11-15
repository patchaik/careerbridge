import { Award, Check, CircleDashed, FileQuestion, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";
import type { EvidenceStatus } from "../../lib/types";

type BadgeVariant = EvidenceStatus | "mandatory_requirement_unmet";

const variantConfig: Record<
  BadgeVariant,
  { label: string; classes: string; icon: typeof Check }
> = {
  present: { label: "Present", classes: "bg-success-100 text-success-800 border-success-200", icon: Check },
  user_confirmed: { label: "Confirmed", classes: "bg-success-100 text-success-800 border-success-200", icon: Check },
  self_reported: { label: "Self-reported", classes: "bg-primary-100 text-primary-800 border-primary-200", icon: FileQuestion },
  not_established: { label: "Not established", classes: "bg-neutral-100 text-neutral-700 border-neutral-200", icon: CircleDashed },
  demonstrated: { label: "Demonstrated", classes: "bg-success-100 text-success-800 border-success-200", icon: Award },
  mandatory_requirement_unmet: { label: "Mandatory requirement unmet", classes: "bg-warning-100 text-warning-800 border-warning-200", icon: TriangleAlert },
};

interface BadgeProps {
  variant: BadgeVariant;
  className?: string;
}

export function Badge({ variant, className }: BadgeProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </span>
  );
}
