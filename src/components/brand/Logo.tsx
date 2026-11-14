// Inline SVG wordmark: "Career" above a stylized suspension bridge (Golden
// Gate-style towers/cables/deck) in International Orange, with "Bridge" set
// into the deck. `compact` trims detail for nav-height legibility.

interface LogoProps {
  variant?: "full" | "compact";
  className?: string;
}

function FullLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 190"
      role="img"
      aria-label="CareerBridge"
      className={className}
    >
      <text
        x="180"
        y="46"
        textAnchor="middle"
        fontSize="42"
        fontWeight="700"
        letterSpacing="0.5"
        fill="var(--color-neutral-900)"
      >
        Career
      </text>

      {/* main cable */}
      <path
        d="M30,150 C55,95 75,66 97,66 C135,66 138,118 180,118 C222,118 225,66 263,66 C285,66 305,95 330,150"
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* suspenders */}
      {[
        [107, 72],
        [124, 84],
        [141, 100],
        [158, 112],
        [198, 112],
        [215, 100],
        [232, 84],
        [249, 72],
      ].map(([x, y]) => (
        <line
          key={x}
          x1={x}
          y1={y}
          x2={x}
          y2="143"
          stroke="var(--color-brand-500)"
          strokeWidth="2.5"
        />
      ))}

      {/* towers */}
      <rect x="90" y="62" width="14" height="88" fill="var(--color-brand-700)" />
      <rect x="256" y="62" width="14" height="88" fill="var(--color-brand-700)" />

      {/* deck */}
      <rect x="30" y="143" width="300" height="18" rx="2" fill="var(--color-brand-700)" />
      <text
        x="180"
        y="156"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        letterSpacing="1.5"
        fill="white"
      >
        BRIDGE
      </text>
    </svg>
  );
}

function CompactLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 185 34"
      role="img"
      aria-label="CareerBridge"
      className={className}
    >
      {/* simplified bridge glyph */}
      <path
        d="M4,24 C7,12 10,8 14,8 C18,8 19,18 23,18 C27,18 28,8 32,8 C36,8 39,12 42,24"
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line x1="14" y1="10" x2="14" y2="23" stroke="var(--color-brand-700)" strokeWidth="2" />
      <line x1="32" y1="10" x2="32" y2="23" stroke="var(--color-brand-700)" strokeWidth="2" />
      <rect x="2" y="23" width="42" height="5" rx="1.5" fill="var(--color-brand-700)" />

      <text
        x="54"
        y="23"
        fontSize="17"
        fontWeight="700"
        fill="var(--color-neutral-900)"
      >
        CareerBridge
      </text>
    </svg>
  );
}

export function Logo({ variant = "full", className }: LogoProps) {
  return variant === "full" ? (
    <FullLogo className={className} />
  ) : (
    <CompactLogo className={className} />
  );
}
