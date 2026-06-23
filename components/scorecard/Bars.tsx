/**
 * Tiny SVG-free bar visuals for the scorecard, built from divs + token colors so
 * they print cleanly and inherit the navy/brick/emerald/rose palette. All three
 * read goal-vs-actual at a glance and degrade to an empty track when data is
 * missing (null), never throwing.
 */

const EMERALD = "bg-emerald-500 dark:bg-emerald-400";
const ROSE = "bg-rose-500 dark:bg-rose-400";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Bullet graph: a fill bar (emerald when meeting goal, rose when behind) with a
 * vertical goal marker. The track is scaled to max(goal, actual) so both the
 * actual fill and the goal tick are always visible.
 */
export function BulletBar({
  actual,
  goal,
  lowerIsBetter = false,
}: {
  actual: number | null | undefined;
  goal: number | null | undefined;
  lowerIsBetter?: boolean;
}) {
  if (actual == null || goal == null || goal <= 0) {
    return <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden />;
  }
  const max = Math.max(goal, actual, 1);
  const fill = clampPct((actual / max) * 100);
  const tick = clampPct((goal / max) * 100);
  const meets = lowerIsBetter ? actual <= goal : actual >= goal;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${meets ? EMERALD : ROSE}`}
        style={{ width: `${fill}%` }}
      />
      <div
        className="absolute inset-y-[-1px] w-0.5 bg-navy-700 dark:bg-slate-300"
        style={{ left: `calc(${tick}% - 1px)` }}
      />
    </div>
  );
}

/**
 * Diverging bar centered on zero: positive extends right (emerald), negative
 * extends left (rose). `max` sets the full half-width scale.
 */
export function DivergingBar({
  value,
  max,
  lowerIsBetter = false,
}: {
  value: number | null | undefined;
  max: number;
  lowerIsBetter?: boolean;
}) {
  if (value == null || max <= 0) {
    return <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden />;
  }
  const half = clampPct((Math.abs(value) / max) * 50);
  const good = lowerIsBetter ? value <= 0 : value >= 0;
  const positive = value >= 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-600" />
      <div
        className={`absolute inset-y-0 rounded-full ${good ? EMERALD : ROSE}`}
        style={
          positive
            ? { left: "50%", width: `${half}%` }
            : { right: "50%", width: `${half}%` }
        }
      />
    </div>
  );
}
