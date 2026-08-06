import { CELL, HEAD, LABEL_CELL, SECONDARY, TierShell, Val, varianceTone } from "./TierShell";
import { num } from "@/lib/utils";
import { STAGES, type CascadeStage, type Tier2, type Tier2Row } from "@/lib/scorecard/tiers/tier2";

/**
 * TIER 2 — Where it's breaking.
 *
 * The VARIANCE cell is the visual anchor, not the volume. Volume tells you how
 * big a market is; variance tells you where to intervene, and the owner beside
 * it tells you who to call. A market's raw counts are rendered small and grey
 * underneath precisely so they cannot win the eye.
 */
export function Tier2Cascade({ data }: { data: Tier2 }) {
  const stageCell = (s: CascadeStage) => (
    <td key={s.key} className={`${CELL} align-top`}>
      <div
        className={`text-[13px] font-semibold ${
          s.variancePts === null
            ? "text-slate-900 dark:text-slate-100"
            : varianceTone(s.variancePts)
        }`}
      >
        <Val m={s.actual} kind="pct" />
      </div>
      <div className={SECONDARY}>
        {s.variancePts === null ? (
          <span title="No benchmark or no actual — variance is not computable.">vs —</span>
        ) : (
          <span className={varianceTone(s.variancePts)}>
            {s.variancePts >= 0 ? "+" : ""}
            {s.variancePts.toFixed(1)} pts
          </span>
        )}
      </div>
      <div className={SECONDARY}>
        {s.numerator === null || s.denominator === null
          ? "—"
          : `${num(s.numerator)} / ${num(s.denominator)}`}
      </div>
    </td>
  );

  const row = (r: Tier2Row, strong = false) => (
    <tr
      key={r.market}
      className={
        strong
          ? "border-t-2 border-slate-300 bg-slate-50/70 dark:border-slate-600 dark:bg-slate-900/40"
          : "border-t border-slate-100 dark:border-slate-800"
      }
    >
      <td className={`${LABEL_CELL} font-medium text-slate-900 dark:text-slate-100`}>{r.label}</td>
      {r.stages.map(stageCell)}
    </tr>
  );

  return (
    <TierShell meta={data.meta}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className={`${LABEL_CELL} font-semibold`}>Market</th>
              {STAGES.map((s) => (
                <th key={s.key} className={HEAD}>
                  <div>{s.label}</div>
                  <div className="font-mono text-[10px] font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                    {s.formula}
                  </div>
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className={`${LABEL_CELL} text-[10px] font-medium normal-case text-slate-400 dark:text-slate-500`}>
                Paged on a miss
              </th>
              {STAGES.map((s) => (
                <th
                  key={s.key}
                  className="px-3 pb-2 text-right text-[10px] font-medium normal-case tracking-normal text-slate-500 dark:text-slate-400"
                >
                  {s.owner}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => row(r))}
            {row(data.company, true)}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-2.5 text-[11.5px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Target is the company&apos;s own year-to-date rate for that stage — behind means worse than
        our own year, which is defensible in the room. Each cell shows actual, variance in points,
        then the raw volumes.
      </p>
    </TierShell>
  );
}
