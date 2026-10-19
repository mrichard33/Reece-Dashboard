import type { Segment, TimelineProblem } from "@/lib/queries/systemHealth.core";
import type { HealthColor } from "@/lib/queries/systemStatus.core";
import { plainTimes, isComingLater } from "@/lib/health/words";
import { etTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * A 24-hour status strip, server-rendered SVG (no chart library): one rect per
 * 30-minute bucket, colored by the worst result any check reported in it, grey
 * where nothing reported. Stretches to the card's width on any screen.
 *
 * 2026-10-15 (the user): the bar read red while the card below it was all
 * green, with nothing to say why. The card is NOW; the bar is the PAST 24
 * hours. So the caption says so, each block names its time on hover, and a
 * tap-to-open list names every check that was red or yellow and when.
 */
const FILL: Record<string, string> = {
  red: "fill-brick-500",
  yellow: "fill-amber-400",
  green: "fill-emerald-500",
  grey: "fill-slate-200 dark:fill-slate-700",
};

const DOT: Record<HealthColor, string> = {
  red: "bg-brick-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
  grey: "bg-slate-300",
};

const COLOR_WORD: Record<string, string> = { red: "a problem", yellow: "something to look at", green: "all good", grey: "no results" };

export function StatusTimeline({
  segments,
  label,
  problems = [],
  greenNow = false,
}: {
  segments: Segment[];
  label: string;
  problems?: TimelineProblem[];
  greenNow?: boolean;
}) {
  if (!segments.length) return null;
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${segments.length} 1`}
        preserveAspectRatio="none"
        className="block h-3 w-full rounded-sm"
        role="img"
        aria-label={`${label}: the past 24 hours, one block per half hour`}
      >
        {segments.map((s, i) => (
          <rect key={s.startMs} x={i} y={0} width={0.92} height={1} className={FILL[s.color]}>
            <title>{`${etTime(s.startMs)} to ${etTime(s.endMs)}: ${COLOR_WORD[s.color] ?? s.color}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="mt-0.5 flex justify-between gap-2 text-[10px] text-slate-400">
        <span>24 hours ago</span>
        <span className="truncate">Past 24 hours · each block is 30 minutes</span>
        <span>Now</span>
      </figcaption>
      {problems.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-xs text-slate-500 underline decoration-dotted underline-offset-2 dark:text-slate-400">
            {greenNow ? "All good now, but had a problem earlier. What happened?" : "What happened in the past 24 hours?"}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {problems.map((p) => (
              <li key={p.checkId} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1 inline-block h-2 w-2 shrink-0 rounded-full", DOT[p.color])} aria-hidden />
                <span className="min-w-0 break-words text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-navy-900 dark:text-slate-100">{p.label}</span>
                  {" · "}
                  {p.times === 1
                    ? `once, at ${etTime(p.firstMs)}`
                    : `${p.times} times, ${etTime(p.firstMs)} to ${etTime(p.lastMs)}`}
                  {p.lastSummary && !isComingLater(p.lastSummary) ? (
                    <span className="block text-slate-500 dark:text-slate-400">Last: {plainTimes(p.lastSummary)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </figure>
  );
}
