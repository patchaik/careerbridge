import { Check, CircleDashed, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AutomationExposure, DemandTrend, RiskSeverity } from "../../../lib/types";

const EXPOSURE_CONFIG: Record<AutomationExposure, { label: string; classes: string; icon: LucideIcon }> = {
  low: { label: "Low automation exposure", classes: "bg-success-100 text-success-800 border-success-200", icon: Check },
  medium: { label: "Medium automation exposure", classes: "bg-warning-100 text-warning-800 border-warning-200", icon: TriangleAlert },
  high: { label: "High automation exposure", classes: "bg-danger-100 text-danger-800 border-danger-200", icon: TriangleAlert },
};

export function ExposureBadge({ exposure, className }: { exposure: AutomationExposure; className?: string }) {
  const config = EXPOSURE_CONFIG[exposure];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes} ${className ?? ""}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </span>
  );
}

const TREND_CONFIG: Record<DemandTrend, { label: string; classes: string; icon: LucideIcon }> = {
  growing: { label: "Growing demand", classes: "bg-success-100 text-success-800 border-success-200", icon: TrendingUp },
  stable: { label: "Stable demand", classes: "bg-neutral-100 text-neutral-700 border-neutral-200", icon: CircleDashed },
  declining: { label: "Declining demand", classes: "bg-warning-100 text-warning-800 border-warning-200", icon: TrendingDown },
};

export function TrendBadge({ trend, className }: { trend: DemandTrend; className?: string }) {
  const config = TREND_CONFIG[trend];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes} ${className ?? ""}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </span>
  );
}

const SEVERITY_CLASSES: Record<RiskSeverity, string> = {
  low: "bg-success-50 text-success-700 border-success-200",
  medium: "bg-warning-50 text-warning-800 border-warning-200",
  high: "bg-danger-50 text-danger-700 border-danger-200",
};

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_CLASSES[severity]}`}
    >
      {severity}
    </span>
  );
}
