import { CELL, HEAD, LABEL_CELL, TierShell, Val, varianceTone } from "./TierShell";
import { num } from "@/lib/utils";
import type { Tier1, Tier1Row } from "@/lib/scorecard/tiers/tier1";

/**
 * TIER 1 — The Number.
 *
 * Five columns. That is the whole design. Every request to add "just one more
 * metric" here costs the five-second read this tier exists to provide, and
 * every other metric already has a tier of its own.
 */
export function Tier1TheNumber({ data }: { data: Tier1 }) {
  const row = (r: Tier1Row, strong = false) => (
    <tr
      key={r.market}
      className={
        strong
          ? "border-t-2 border-slate-300 bg-slate-50/70 font-semibold dark:border-slate-600 dark:bg-slate-900/40"
          : "border-t border-slate-100 dark:border-slate-800"
      }
    >
      <td className={`${LABEL_CELL} font-medium text-slate-900 dark:text-slate-100`}>{r.label}</td>
      <td className={CELL}>
        <Val m={r.goal} kind="usd" />
      </td>
      <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
        <Val m={r.actual} kind="usd" />
      </td>
      <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
        <Val m={r.pace} kind="usd" />
      </td>
      <td className={CELL}>
        <Val m={r.projected} kind="usd" />
      </td>
      <td className={`${CELL} ${varianceTone(r.variance.known ? r.variance.value : null)}`}>
        <Val m={r.variance} kind="usd" signed />
      </td>
    </tr>
  );

  return (
    <TierShell
      meta={data.meta}
      action={
        <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {num(data.elapsedSellingDays)} of {num(data.totalSellingDays)} selling days
        </span>
      }
    >
      {data.lowConfidence && (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-[12px] text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
          Only {num(data.elapsedSellingDays)} of {num(data.totalSellingDays)} selling days have
          elapsed. Projected Finish and Variance are a run-rate off a very small base — read them as
          direction, not forecast.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className={`${LABEL_CELL} font-semibold`}>Market</th>
              <th className={HEAD}>Goal</th>
              <th className={HEAD}>Actual</th>
              <th className={HEAD}>Pace</th>
              <th className={HEAD}>Projected finish</th>
              <th className={HEAD}>Variance</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => row(r))}
            {row(data.company, true)}
          </tbody>
        </table>
      </div>
    </TierShell>
  );
}
