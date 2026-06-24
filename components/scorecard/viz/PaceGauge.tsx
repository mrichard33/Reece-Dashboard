import { SC_COLOR } from "./colors";

type GaugeTone = "rose" | "amber" | "emerald" | "navy";

const TONE_FILL: Record<GaugeTone, string> = {
  rose: SC_COLOR.rose,
  amber: SC_COLOR.amber,
  emerald: SC_COLOR.emerald,
  navy: SC_COLOR.navy,
};

/**
 * 180° semicircle gauge: net sales as a share of the prorated pace goal. Track is
 * a hairline slate arc; the fill arc is colored by tone and grows via dasharray.
 */
export function PaceGauge({
  pct,
  tone = "rose",
  size = 188,
}: {
  pct: number;
  tone?: GaugeTone;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size * 0.92;
  const circ = Math.PI * r; // half circumference
  const dash = (clamped / 100) * circ;
  const polar = (deg: number): [number, number] => {
    const a = ((180 - deg) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [sx, sy] = polar(0);
  const [ex, ey] = polar(180);
  const color = TONE_FILL[tone] ?? SC_COLOR.navy;
  const arc = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        <path
          d={arc}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth={size * 0.085}
          strokeLinecap="round"
        />
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.085}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className="sc-anim"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div
          className="font-mono font-bold leading-none tabular text-slate-900 dark:text-slate-100"
          style={{ fontSize: size * 0.2 }}
        >
          {Math.round(clamped)}
          <span className="text-slate-400" style={{ fontSize: size * 0.1 }}>
            %
          </span>
        </div>
        <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
          of pace goal
        </div>
      </div>
    </div>
  );
}
