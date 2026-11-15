// Self-contained hero visual: a minimalist suspension-bridge silhouette with
// a single glowing dot hopping across 6 labeled stops (the main journey
// groups), looping forever. Inline SVG + generated CSS keyframes only — no
// image assets, no animation libraries. See the constants below to tweak
// timing/colors/positions.

// ---- Tweak these ----------------------------------------------------------
const STOPS = ["Profile", "Direction", "Skills", "Learn", "Prove", "Progress"] as const;
const STOP_X = [40, 104, 168, 232, 296, 360]; // deck x-positions (viewBox units)

const HOLD_MS = 1800; // how long the dot pauses at each stop
const JUMP_MS = 350; // how long the hop between stops takes
const HOP_HEIGHT = 10; // how high the dot lifts mid-hop (viewBox units)

const BRIDGE_COLOR = "#EF4444"; // neon red
const DOT_COLOR = "#0EA5E9"; // electric blue
const LABEL_COLOR = "#E2E8F0"; // light slate, for readability on black
const BG_COLOR = "#0A0A0F"; // near-black
// ---------------------------------------------------------------------------

const VIEWBOX_W = 400;
const VIEWBOX_H = 260;
const DECK_Y = 190;
const TOWER_XS = [110, 290];
const TOWER_TOP_Y = 50;
const DOT_RADIUS = 5;

const SEGMENT_MS = HOLD_MS + JUMP_MS;
const TOTAL_MS = SEGMENT_MS * STOPS.length;
const POP_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // springy "pop" overshoot

function pct(ms: number): string {
  return ((ms / TOTAL_MS) * 100).toFixed(3);
}

// One @keyframes rule moving the dot (as a translate relative to stop 0) in
// discrete hops: hold flat, lift, translate while lifted, land.
function buildDotKeyframes(): string {
  const n = STOPS.length;
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const holdStart = i * SEGMENT_MS;
    const holdEnd = holdStart + HOLD_MS;
    const liftAt = holdEnd + JUMP_MS * 0.3;
    const moveAt = holdEnd + JUMP_MS * 0.75;
    const jumpEnd = holdStart + SEGMENT_MS;
    const dx = STOP_X[i] - STOP_X[0];
    const nextDx = STOP_X[(i + 1) % n] - STOP_X[0];
    lines.push(`${pct(holdStart)}% { transform: translate(${dx}px, 0px); }`);
    lines.push(`${pct(holdEnd)}% { transform: translate(${dx}px, 0px); }`);
    lines.push(
      `${pct(liftAt)}% { transform: translate(${dx}px, -${HOP_HEIGHT}px); animation-timing-function: ${POP_EASE}; }`,
    );
    lines.push(
      `${pct(moveAt)}% { transform: translate(${nextDx}px, -${HOP_HEIGHT}px); animation-timing-function: ${POP_EASE}; }`,
    );
    lines.push(`${pct(jumpEnd)}% { transform: translate(${nextDx}px, 0px); }`);
  }
  return `@keyframes bja-dot-move {\n${lines.join("\n")}\n}`;
}

// One @keyframes rule per stop label: fade in as the dot arrives (during the
// previous jump), hold visible through the stop's pause, fade out as the dot
// leaves (during the next jump). Stop 0 wraps across the loop boundary.
function buildLabelKeyframes(index: number): string {
  const holdStart = index * SEGMENT_MS;
  const holdEnd = holdStart + HOLD_MS;
  const fadeInStart = holdStart - JUMP_MS;
  const fadeOutEnd = holdEnd + JUMP_MS;

  const entries: { ms: number; opacity: number }[] = [];
  if (fadeInStart < 0) {
    entries.push({ ms: TOTAL_MS + fadeInStart, opacity: 0 });
    entries.push({ ms: TOTAL_MS, opacity: 1 });
    entries.push({ ms: 0, opacity: 1 });
  } else {
    entries.push({ ms: fadeInStart, opacity: 0 });
    entries.push({ ms: holdStart, opacity: 1 });
  }
  entries.push({ ms: holdEnd, opacity: 1 });
  entries.push({ ms: Math.min(fadeOutEnd, TOTAL_MS), opacity: 0 });

  entries.sort((a, b) => a.ms - b.ms);
  const lines = entries.map((e) => `${pct(e.ms)}% { opacity: ${e.opacity}; }`);
  return `@keyframes bja-label-${index}-fade {\n${lines.join("\n")}\n}`;
}

const GENERATED_CSS = `
${buildDotKeyframes()}
${STOPS.map((_, i) => buildLabelKeyframes(i)).join("\n")}

.bja-dot {
  animation: bja-dot-move ${TOTAL_MS}ms linear infinite;
}
${STOPS.map(
  (_, i) => `.bja-label-${i} {
  animation: bja-label-${i}-fade ${TOTAL_MS}ms linear infinite;
}`,
).join("\n")}

.bja-static { display: none; }

@media (prefers-reduced-motion: reduce) {
  .bja-animated { display: none; }
  .bja-static { display: block; }
}
`;

// Main-span cable sag, approximated as a parabola anchored at the two tower
// tops — used to place the suspender cables. Purely a drawing aid, not a
// physical simulation.
function cableTopY(x: number): number {
  const mid = (TOWER_XS[0] + TOWER_XS[1]) / 2;
  const half = (TOWER_XS[1] - TOWER_XS[0]) / 2;
  const sag = 105;
  return TOWER_TOP_Y + sag * (1 - ((x - mid) / half) ** 2);
}

const SUSPENDER_XS = [130, 150, 170, 190, 210, 230, 250, 270];

function BridgeSilhouette() {
  return (
    <g stroke={BRIDGE_COLOR} fill="none" filter="url(#bja-glow-blue)">
      {/* Deck */}
      <path d="M20,190 L380,190" strokeWidth={1.5} />
      {/* Approach ramps */}
      <path d="M20,190 L6,228" strokeWidth={1.5} />
      <path d="M380,190 L394,228" strokeWidth={1.5} />

      {/* Towers */}
      {TOWER_XS.map((x) => (
        <g key={x}>
          <path d={`M${x - 10},${TOWER_TOP_Y} L${x - 10},190`} strokeWidth={1.25} />
          <path d={`M${x + 10},${TOWER_TOP_Y} L${x + 10},190`} strokeWidth={1.25} />
          <path d={`M${x - 10},56 L${x + 10},56`} strokeWidth={1} />
          <path d={`M${x - 10},96 L${x + 10},96`} strokeWidth={1} />
          <path d={`M${x - 10},136 L${x + 10},136`} strokeWidth={1} />
        </g>
      ))}

      {/* Main cables: left side-span, main span (sag), right side-span */}
      <path d="M20,150 Q65,60 110,50" strokeWidth={1.25} />
      <path d="M110,50 Q200,160 290,50" strokeWidth={1.25} />
      <path d="M290,50 Q335,60 380,150" strokeWidth={1.25} />

      {/* Suspender cables */}
      {SUSPENDER_XS.map((x) => (
        <path key={x} d={`M${x},${cableTopY(x)} L${x},190`} strokeWidth={0.75} />
      ))}
    </g>
  );
}

export function BridgeJourneyAnimation() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl shadow-md"
      style={{ backgroundColor: BG_COLOR, aspectRatio: `${VIEWBOX_W} / ${VIEWBOX_H}` }}
    >
      <style>{GENERATED_CSS}</style>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="h-full w-full"
        role="img"
        aria-label="Animated illustration of a dot travelling across a bridge through the stages: Profile, Direction, Skills, Learn, Prove, Progress"
      >
        <defs>
          <filter id="bja-glow-blue" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bja-glow-red" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <BridgeSilhouette />

        {/* Animated: one dot hopping between stops, one fading label per stop */}
        <g className="bja-animated">
          {STOPS.map((label, i) => (
            <text
              key={label}
              className={`bja-label-${i}`}
              x={STOP_X[i]}
              y={DECK_Y + 24}
              textAnchor="middle"
              fontSize={11}
              fontFamily="system-ui, sans-serif"
              fill={LABEL_COLOR}
            >
              {label}
            </text>
          ))}
          <circle
            className="bja-dot"
            cx={STOP_X[0]}
            cy={DECK_Y - DOT_RADIUS}
            r={DOT_RADIUS}
            fill={DOT_COLOR}
            filter="url(#bja-glow-red)"
          />
        </g>

        {/* prefers-reduced-motion fallback: all 6 stops shown at once, static */}
        <g className="bja-static">
          {STOPS.map((label, i) => (
            <g key={label}>
              <circle
                cx={STOP_X[i]}
                cy={DECK_Y - DOT_RADIUS}
                r={DOT_RADIUS}
                fill={DOT_COLOR}
                filter="url(#bja-glow-red)"
              />
              <text
                x={STOP_X[i]}
                y={DECK_Y + 24}
                textAnchor="middle"
                fontSize={11}
                fontFamily="system-ui, sans-serif"
                fill={LABEL_COLOR}
              >
                {label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
