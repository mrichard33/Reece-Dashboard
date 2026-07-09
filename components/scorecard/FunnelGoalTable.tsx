import { num } from "@/lib/utils";
import { pct } from "./format";
import { scPts } from "@/lib/scorecard/viewModel";
import { ScCard } from "./ScCard";
import type { ScorecardView } from "@/lib/queries/scorecard";

/**
 * Section ② — Funnel vs Goal. Merges the old Funnel + Rates cards into one table:
 * the four funnel counts (Leads → Issued → Demos → Sales) and the four rates
 * (Close / Demo / Good Rate / KO %), each against Monthly Goal · Target to Date ·
 * Actual · Pace. "Target to Date" = the monthly goal scaled to selling days
 * elapsed (counts) or the flat target (rates). KO% is inverted — lower is better.
 */

type Row = {
  metric: string;
  monthly: string | null;
  targetToDate: string | null;
  actual: string;
  pace: string | null;
  paceTone: "pos" | "neg" | "plain";
};

const r0 = (v: number) => Math.round(v);

export function FunnelGoalTable({ view }: { view: ScorecardView }) {
  const { actuals: a, goals: g, derived: d } = view;
  const daysElapsed = a.days_elapsed || 1;
  const sellingDays = a.working_days_in_period ?? g.working_days ?? 26;

  // ── count rows: goal = per-day target × days (target-to-date) or × selling days (monthly)
  const countRow = (metric: string, actual: number, perDay: number | null): Row => {
    const ttd = perDay == null ? null : r0(perDay * daysElapsed);
    const monthly = perDay == null ? null : r0(perDay * sellingDays);
    const paceVal = ttd == null ? null : actual - ttd;
    return {
      metric,
      monthly: monthly == null ? null : num(monthly),
      targetToDate: ttd == null ? null : num(ttd),
      actual: num(actual),
      pace: paceVal == null ? null : (paceVal >= 0 ? "+" : "") + num(paceVal),
      paceTone: paceVal == null ? "plain" : paceVal >= 0 ? "pos" : "neg",
    };
  };

  // ── rate rows: percentages don't prorate — target-to-date = the flat target.
  const rateRow = (
    metric: string,
    actual: number | null,
    target: number,
    ptsGap: number | null,
    higherIsBetter: boolean,
  ): Row => {
    const tone: Row["paceTone"] =
      ptsGap == null
        ? "plain"
        : (higherIsBetter ? ptsGap >= 0 : ptsGap <= 0)
          ? "pos"
          : "neg";
    return {
      metric,
      monthly: pct(target),
      targetToDate: pct(target),
      actual: pct(actual),
      pace: ptsGap == null ? null : scPts(ptsGap),
      paceTone: tone,
    };
  };

  const rows: Row[] = [
    countRow("Leads", a.leads, null),
    countRow("Issued", a.issued, d.target_issued_per_day),
    countRow("Demos", a.demos, d.target_demoed_per_day),
    countRow("Sales", a.sales, d.target_closed_per_day),
    rateRow("Close %", a.close_pct, g.target_close_pct, d.variance.close_pts, true),
    rateRow("Demo %", a.demo_pct, g.target_demo_pct, d.variance.demo_pts, true),
    rateRow("Good Rate %", a.good_rate_pct, g.target_good_rate_pct, d.variance.good_rate_pts, true),
    rateRow("KO %", a.ko_pct, g.target_ko_pct, d.variance.ko_pts, false),
  ];

  const toneCls = (t: Row["paceTone"]) =>
    t === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : t === "neg"
        ? "text-brick"
        : "text-slate-400";

  return (
    <ScCard
      id="sc-funnel"
      title="Funnel vs Goal"
      lead="Every stage and rate against the monthly goal, the target you should have reached by today, and where you actually are."
      info={{
        what: "Funnel counts (Leads → Issued → Demos → Sales) and the four rates (Close / Demo / Good Rate / KO %) vs goal. KO% is inverted — lower is better.",
        where: "Actuals from LP raw data for this window; goals & per-day targets from Edit Goals.",
        fix: "A red Pace on a rate row means that conversion is under target — dig into the stage above it.",
      }}
    >
      <div className="overflow-x-auto p-2 sm:p-4">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="border-b border-slate-100 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800">
              <th className="px-3 py-2 text-left font-semibold">Metric</th>
              <th className="px-3 py-2 text-right font-semibold">Monthly Goal</th>
              <th className="px-3 py-2 text-right font-semibold">
                <span className="inline-flex items-center gap-1" title="Monthly goal scaled to selling days elapsed.">
                  Target to Date
                  <span className="text-slate-400" aria-hidden>ⓘ</span>
                </span>
              </th>
              <th className="px-3 py-2 text-right font-semibold">Actual</th>
              <th className="px-3 py-2 text-right font-semibold">Pace</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {rows.map((row, i) => (
              <tr
                key={row.metric}
                className={`border-b border-slate-50 last:border-0 dark:border-slate-900 ${i === 4 ? "border-t-2 border-t-slate-100 dark:border-t-slate-800" : ""}`}
              >
                <td className="px-3 py-2 font-sans font-medium text-slate-700 dark:text-slate-200">{row.metric}</td>
                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{row.monthly ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{row.targetToDate ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{row.actual}</td>
                <td className={`px-3 py-2 text-right font-semibold ${toneCls(row.paceTone)}`}>{row.pace ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScCard>
  );
}
