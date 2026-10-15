import type { Segment } from "@/lib/queries/systemHealth.core";

/**
 * A 24-hour status strip, server-rendered SVG (no chart library): one rect per
 * 30-minute bucket, colored by the worst result any check reported in it, grey
 * where nothing reported. Stretches to the card's width on any screen.
 */
const FILL: Record<string, string> = {
  red: "fill-rose-500",
  yellow: "fill-amber-400",
  green: "fill-emerald-500",
  grey: "fill-slate-200 dark:fill-slate-700",
};

export function StatusTimeline({ segments, label }: { segments: Segment[]; label: string }) {
  if (!segments.length) return null;
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${segments.length} 1`}
        preserveAspectRatio="none"
        className="block h-3 w-full rounded-sm"
        role="img"
        aria-label={`${label}: the last 24 hours, half an hour per block`}
      >
        {segments.map((s, i) => (
          <rect key={s.startMs} x={i} y={0} width={0.92} height={1} className={FILL[s.color]} />
        ))}
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[10px] text-slate-400">
        <span>24h ago</span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}
