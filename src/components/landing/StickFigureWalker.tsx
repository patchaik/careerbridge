// Small decorative overlay for the "How it works" arch line: a stick figure
// that walks the curve in discrete steps, stopping at each of the 5 stage
// cards (Profile, Direction, Skills, Learn, Prove). A thought bubble ("...")
// appears at each stop except the last, where it gets a green "Hired" badge
// instead. Inline SVG + generated CSS only — no new dependencies.
//
// IMPORTANT: ARCH_PATH must stay identical to the `d` attribute of the line
// path in JourneyStepper.tsx (same viewBox, same curve) or the figure will
// drift off the visible line.
const ARCH_PATH = "M20,28 Q500,-4 980,28";

// ---- Tweak these -----------------------------------------------------------
const FIGURE_COLOR = "#3730A3"; // brand indigo/navy
const SCALE = 1.6; // uniform size multiplier for the figure + its bubble/badge
const RESET_PCT = 2; // offset-distance% the figure resets to (just past the left edge) before walking in
// offset-distance% of each stop, in order — matches the 5 cards 1:1
const STOP_PCT = [10, 30, 50, 70, 90]; // Profile, Direction, Skills, Learn, Prove
const GLIDE_MS = 1700; // time to walk from one stop to the next
const HOLD_MS = 1700; // pause at each stop (how long the bubble/badge is shown)
const FADE_MS = 400; // fade out at the end / fade in in at the reset point
const STEPS_PER_GLIDE = 4; // discrete foot-falls per walk between two stops — higher = quicker steps, lower = fewer, more deliberate steps
const SWING_DEG = 40; // how far each leg/arm swings — higher = more visible crossing
// -----------------------------------------------------------------------------

interface Window {
  start: number;
  end: number;
}

// ---- Build the master timeline from the constants above --------------------
const fadeInWindow: Window = { start: 0, end: FADE_MS };
const glideWindows: (Window & { from: number; to: number })[] = [];
const holdWindows: Window[] = [];
{
  let t = FADE_MS;
  let prevPos = RESET_PCT;
  for (const stopPct of STOP_PCT) {
    const glideStart = t;
    const glideEnd = t + GLIDE_MS;
    glideWindows.push({ start: glideStart, end: glideEnd, from: prevPos, to: stopPct });
    t = glideEnd;
    const holdEnd = t + HOLD_MS;
    holdWindows.push({ start: t, end: holdEnd });
    t = holdEnd;
    prevPos = stopPct;
  }
}
const fadeOutWindow: Window = { start: holdWindows[holdWindows.length - 1].end, end: holdWindows[holdWindows.length - 1].end + FADE_MS };
const TOTAL_MS = fadeOutWindow.end;

function pctOf(ms: number): string {
  return ((ms / TOTAL_MS) * 100).toFixed(3);
}

function buildPositionKeyframes(): string {
  const entries: { ms: number; v: number }[] = [{ ms: 0, v: RESET_PCT }];
  for (const g of glideWindows) {
    entries.push({ ms: g.start, v: g.from });
    entries.push({ ms: g.end, v: g.to });
  }
  entries.push({ ms: TOTAL_MS, v: STOP_PCT[STOP_PCT.length - 1] });
  const lines = entries.map((e) => `${pctOf(e.ms)}% { offset-distance: ${e.v}%; }`);
  return `@keyframes walker-position {\n${lines.join("\n")}\n}`;
}

function buildOpacityKeyframes(): string {
  const entries = [
    { ms: 0, v: 0 },
    { ms: fadeInWindow.end, v: 1 },
    { ms: fadeOutWindow.start, v: 1 },
    { ms: fadeOutWindow.end, v: 0 },
  ];
  const lines = entries.map((e) => `${pctOf(e.ms)}% { opacity: ${e.v}; }`);
  return `@keyframes walker-opacity {\n${lines.join("\n")}\n}`;
}

// One leg/arm's rotation: neutral (0deg) outside glide windows, swinging
// between +SWING_DEG/-SWING_DEG in discrete steps during each glide.
// phaseOffset flips which side starts forward, so the two legs (and the two
// arms, paired with the opposite leg for a natural gait) alternate.
function buildPhaseKeyframes(name: string, phaseOffset: 0 | 1): string {
  const entries: { ms: number; deg: number }[] = [{ ms: 0, deg: 0 }];
  for (const g of glideWindows) {
    entries.push({ ms: g.start, deg: 0 });
    const span = g.end - g.start;
    for (let s = 1; s < STEPS_PER_GLIDE; s++) {
      const ms = g.start + Math.round((span * s) / STEPS_PER_GLIDE);
      const deg = (s + phaseOffset) % 2 === 0 ? SWING_DEG : -SWING_DEG;
      entries.push({ ms, deg });
    }
    entries.push({ ms: g.end, deg: 0 });
  }
  entries.push({ ms: TOTAL_MS, deg: 0 });
  const lines = entries.map((e) => `${pctOf(e.ms)}% { transform: rotate(${e.deg}deg); }`);
  return `@keyframes ${name} {\n${lines.join("\n")}\n}`;
}

// Per-stop overlay (thought bubble / "Hired" badge): invisible except during
// that stop's own hold window, where it fades in, stays, then fades out.
function buildOverlayKeyframes(index: number): string {
  const h = holdWindows[index];
  const fade = Math.min(200, Math.floor((h.end - h.start) / 4));
  const entries = [
    { ms: 0, v: 0 },
    { ms: h.start, v: 0 },
    { ms: h.start + fade, v: 1 },
    { ms: h.end - fade, v: 1 },
    { ms: h.end, v: 0 },
    { ms: TOTAL_MS, v: 0 },
  ];
  const lines = entries.map((e) => `${pctOf(e.ms)}% { opacity: ${e.v}; }`);
  return `@keyframes walker-overlay-${index}-fade {\n${lines.join("\n")}\n}`;
}

const GENERATED_CSS = `
${buildPositionKeyframes()}
${buildOpacityKeyframes()}
${buildPhaseKeyframes("walker-phase-x", 0)}
${buildPhaseKeyframes("walker-phase-y", 1)}
${STOP_PCT.map((_, i) => buildOverlayKeyframes(i)).join("\n")}

.walker-group {
  offset-path: path('${ARCH_PATH}');
  offset-rotate: 0deg;
  offset-distance: ${RESET_PCT}%;
  animation:
    walker-position ${TOTAL_MS}ms linear infinite,
    walker-opacity ${TOTAL_MS}ms linear infinite;
}

.walker-phase-x { animation: walker-phase-x ${TOTAL_MS}ms linear infinite; }
.walker-phase-y { animation: walker-phase-y ${TOTAL_MS}ms linear infinite; }

${STOP_PCT.map((_, i) => `.walker-overlay-${i} { animation: walker-overlay-${i}-fade ${TOTAL_MS}ms linear infinite; }`).join("\n")}

@media (prefers-reduced-motion: reduce) {
  .walker-group {
    animation: none !important;
    offset-distance: 50%;
    opacity: 1 !important;
  }
  .walker-phase-x, .walker-phase-y {
    animation: none !important;
  }
  ${STOP_PCT.map((_, i) => `.walker-overlay-${i} { animation: none !important; opacity: ${i === STOP_PCT.length - 1 ? 1 : 0} !important; }`).join("\n")}
}
`;

function ThoughtBubble() {
  return (
    <g>
      <circle cx={5} cy={-19} r={1.1} fill="#FFFFFF" stroke="#D1D5DB" strokeWidth={0.6} />
      <circle cx={7.5} cy={-22.5} r={1.5} fill="#FFFFFF" stroke="#D1D5DB" strokeWidth={0.6} />
      <ellipse cx={12} cy={-28} rx={6.5} ry={4.5} fill="#FFFFFF" stroke="#D1D5DB" strokeWidth={0.7} />
      <text
        x={12}
        y={-26.3}
        textAnchor="middle"
        fontSize={5.5}
        fontFamily="system-ui, sans-serif"
        fill="#6B7280"
      >
        ...
      </text>
    </g>
  );
}

function HiredBadge() {
  return (
    <g>
      <rect x={3} y={-31} width={18} height={7.5} rx={3.75} fill="#16A34A" />
      <text
        x={12}
        y={-25.9}
        textAnchor="middle"
        fontSize={5}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        fill="#FFFFFF"
      >
        Hired
      </text>
    </g>
  );
}

export function StickFigureWalker() {
  return (
    <svg
      viewBox="0 0 1000 32"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute -top-5 left-0 h-6 w-full overflow-visible"
      style={{ overflow: "visible" }}
    >
      <style>{GENERATED_CSS}</style>
      {/* offset-path/offset-distance animate THIS group only — scale lives on a
          separate static wrapper so it never has to compose with the motion-path
          transform. */}
      <g className="walker-group">
        <g transform={`scale(${SCALE})`}>
          {/* Local origin (0,0) = feet/ground contact point on the arch path. */}
          <g stroke={FIGURE_COLOR} strokeWidth={1.4} strokeLinecap="round" fill="none">
            {/* Back arm/leg */}
            <line className="walker-phase-y" x1={0} y1={-6} x2={-3.5} y2={0} style={{ transformOrigin: "0px -6px" }} />
            <line className="walker-phase-x" x1={0} y1={-11} x2={3} y2={-4} style={{ transformOrigin: "0px -11px" }} />

            {/* Torso */}
            <line x1={0} y1={-13} x2={0} y2={-6} />

            {/* Front arm/leg */}
            <line className="walker-phase-x" x1={0} y1={-6} x2={3.5} y2={0} style={{ transformOrigin: "0px -6px" }} />
            <line className="walker-phase-y" x1={0} y1={-11} x2={-3} y2={-4} style={{ transformOrigin: "0px -11px" }} />

            {/* Head */}
            <circle cx={0} cy={-16} r={2.5} fill={FIGURE_COLOR} stroke="none" />
          </g>

          {/* One overlay per stop — thought bubble for all but the last, which gets "Hired" instead */}
          {STOP_PCT.map((_, i) => (
            <g key={i} className={`walker-overlay-${i}`}>
              {i === STOP_PCT.length - 1 ? <HiredBadge /> : <ThoughtBubble />}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
