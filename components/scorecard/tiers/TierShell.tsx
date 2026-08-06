import type { ReactNode } from "react";
import { BASIS_EXPLAINER, type Measured, type TierMeta } from "@/lib/scorecard/tiers/types";
import { num, usd, usdExact } from "@/lib/utils";

/**
 * The shell every tier renders inside.
 *
 * The DATE BASIS is a first-class part of the header — a badge, in the same
 * line as the title, always visible. It is not a footnote and not a tooltip.
 * Three tiers sitting on three different bases is the single reason people
 * concluded "the numbers never match"; stating each basis where the eye
 * already is turns that from a contradiction into an explanation.
 */
export function TierShell({
  meta,
  action,
  children,
}: {
  meta: TierMeta;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`tier-${meta.tier}`}
      className="scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="border-b border-slate-100 px-5 pb-3 pt-4 dark:border-slate-800">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-slate-500">
              TIER {meta.tier}
            </span>
            <h3 className="font-display text-[15px] font-semibold text-slate-900 dark:text-slate-100">
              {meta.title}
            </h3>
            <span
              className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              title={BASIS_EXPLAINER[meta.basis]}
            >
              {meta.basisDetail}
            </span>
          </div>
          {action}
        </div>
        <p className="pt-1.5 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
          {meta.question}{" "}
          <span className="text-slate-400 dark:text-slate-500">· {meta.source}</span>
        </p>
      </div>
      {children}
    </section>
  );
}

/** Shared table cell classes so every tier's numbers line up identically. */
export const CELL = "px-3 py-2 text-right font-mono tabular";
export const HEAD = "px-3 py-2.5 text-right font-semibold";
export const LABEL_CELL = "px-3 py-2 text-left";

/**
 * Render a Measured figure.
 *
 * A blank is "—" and carries its reason in the title attribute. It is NEVER
 * `$0` or `0%`: a zero reads as a measurement — "no jobs are held in HOA" —
 * and will be believed by someone making a decision on it.
 */
export function Val({
  m,
  kind = "num",
  className = "",
  signed = false,
}: {
  m: Measured;
  kind?: "num" | "usd" | "usdExact" | "pct" | "pts" | "days";
  className?: string;
  signed?: boolean;
}) {
  if (!m.known) {
    return (
      <span
        className={`cursor-help text-slate-300 dark:text-slate-600 ${className}`}
        title={m.reason}
        aria-label={`Not available — ${m.reason}`}
      >
        —
      </span>
    );
  }
  const v = m.value;
  const sign = signed && v > 0 ? "+" : "";
  let text: string;
  switch (kind) {
    case "usd":
      text = sign + usd(v);
      break;
    case "usdExact":
      text = sign + usdExact(v);
      break;
    case "pct":
      text = `${sign}${v.toFixed(1)}%`;
      break;
    case "pts":
      text = `${sign}${v.toFixed(1)} pts`;
      break;
    case "days":
      text = `${num(v)} d`;
      break;
    default:
      text = sign + num(v);
  }
  return <span className={className}>{text}</span>;
}

/** Tone for a variance: green above, red below, neutral when unmeasurable. */
export function varianceTone(v: number | null, lowerIsBetter = false): string {
  if (v === null) return "text-slate-400 dark:text-slate-500";
  const good = lowerIsBetter ? v <= 0 : v >= 0;
  return good ? "text-emerald-600 dark:text-emerald-400" : "text-brick dark:text-rose-400";
}

/** Volume rendered deliberately quiet — present, never the visual anchor. */
export const SECONDARY = "text-[11px] font-normal text-slate-400 dark:text-slate-500";
