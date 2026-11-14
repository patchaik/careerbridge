// Mirrors src/assets/careerbridge-logo.svg exactly (shapes, proportions,
// coordinates) — do not redraw. That file is the `stacked` variant; the
// others reuse the same bridge-mark geometry at different crops/colors.

const NAVY = "#1E293B";
const INDIGO = "#3730A3";
const SLATE = "#64748B";
const WHITE = "#F8FAFC";
const INDIGO_LIGHT = "#A5B4FC";
const SLATE_LIGHT = "#CBD5E1";

function BridgeMarkShapes({ color, accent }: { color: string; accent: string }) {
  return (
    <>
      <rect x="114" y="66" width="6" height="74" fill={color} />
      <rect x="150" y="66" width="6" height="74" fill={color} />
      <rect x="114" y="79" width="42" height="3" fill={color} />
      <path
        d="M117 68 Q96 72 78 120 M117 76 Q100 80 86 120 M117 84 Q104 88 94 120 M153 68 Q174 72 192 120 M153 76 Q170 80 184 120 M153 84 Q166 88 176 120 M117 70 Q135 112 153 70"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M127 84 L127 120 M135 90 L135 120 M143 84 L143 120"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
      />
      <rect x="72" y="120" width="126" height="5" rx="1" fill={color} />
      <circle cx="78" cy="122.5" r="3" fill={accent} />
      <circle cx="192" cy="122.5" r="3" fill={accent} />
    </>
  );
}

function StackedLogo({ className, inverse }: { className?: string; inverse?: boolean }) {
  const color = inverse ? WHITE : NAVY;
  const accent = inverse ? INDIGO_LIGHT : INDIGO;
  const tagline = inverse ? SLATE_LIGHT : SLATE;
  return (
    <svg viewBox="60 56 150 142" role="img" aria-label="CareerBridge" className={className}>
      <BridgeMarkShapes color={color} accent={accent} />
      <text
        x="135"
        y="168"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="21"
        fontWeight="700"
        letterSpacing="-0.3"
      >
        <tspan fill={color}>Career</tspan>
        <tspan fill={accent}>Bridge</tspan>
      </text>
      <text
        x="135"
        y="190"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="11"
        fontWeight="500"
        letterSpacing="2"
        fill={tagline}
      >
        AI-READY CAREERS
      </text>
    </svg>
  );
}

function MarkLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="68 60 134 84" role="img" aria-label="CareerBridge" className={className}>
      <BridgeMarkShapes color={NAVY} accent={INDIGO} />
    </svg>
  );
}

function HorizontalLogo({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="CareerBridge" className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg viewBox="68 60 134 84" aria-hidden="true" className="h-8 w-auto flex-shrink-0">
        <BridgeMarkShapes color={NAVY} accent={INDIGO} />
      </svg>
      <span
        aria-hidden="true"
        className="text-lg font-bold leading-none tracking-tight"
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        <span style={{ color: NAVY }}>Career</span>
        <span style={{ color: INDIGO }}>Bridge</span>
      </span>
    </span>
  );
}

interface LogoProps {
  variant?: "stacked" | "horizontal" | "mark" | "inverse";
  className?: string;
}

export function Logo({ variant = "stacked", className }: LogoProps) {
  switch (variant) {
    case "horizontal":
      return <HorizontalLogo className={className} />;
    case "mark":
      return <MarkLogo className={className} />;
    case "inverse":
      return <StackedLogo className={className} inverse />;
    default:
      return <StackedLogo className={className} />;
  }
}
