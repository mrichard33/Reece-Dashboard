import { num } from "@/lib/utils";
import { pct } from "./format";
import { ScSection } from "./ScSection";
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
  paceLabel: string | null;
  paceCls: string;
};

const r0 = (v: number) => Math.round(v);

const EMERALD = "text-emerald-600 dark:text-emerald-400";
const AMBER = "text-amber-600 dark:text-amber-400";
const BRICK = "text-brick";
const MUTE = "text-slate-400";

export function FunnelGoalTable({ view }: { view: ScorecardView }) {
  const { actuals: a, goals: g, derived: d } = view;
  const daysElapsed = a.days_elapsed ?? 0;
  // Same period-wide denominator as the ① hero (period_working_days first) so the
  // "Monthly Goal" column and the pace strip never disagree on the day basis.
  const sellingDays = a.period_working_days ?? a.working_days_in_period ?? g.working_days ?? 26;

  // ── count rows: goal = per-day target × days (target-to-date) or × selling days (monthly).
  //    A miss on a volume row is amber (recoverable), matching the approved design.
  const countRow = (metric: string, actual: number, perDay: number | null): Row => {
    const ttd = perDay == null ? null : r0(perDay * daysElapsed);
    const monthly = perDay == null ? null : r0(perDay * sellingDays);
    const paceVal = ttd == null ? null : actual - ttd;
    return {
      metric,
      monthly: monthly == null ? null : num(monthly),
      targetToDate: ttd == null ? null : num(ttd),
      actual: num(actual),
      paceLabel: paceVal == null ? null : `${paceVal >= 0 ? "+" : ""}${num(paceVal)} vs pace`,
      paceCls: paceVal == null ? MUTE : paceVal >= 0 ? EMERALD : AMBER,
    };
  };

  // ── rate rows: percentages don't prorate — target-to-date = the flat target.
  //    A miss on a rate row is red (a quality problem).
  const rateRow = (
    metric: string,
    actual: number | null,
    target: number,
    ptsGap: number | null,
    higherIsBetter: boolean,
  ): Row => {
    const good = ptsGap == null ? null : higherIsBetter ? ptsGap >= 0 : ptsGap <= 0;
    return {
      metric,
      monthly: pct(target),
      targetToDate: pct(target),
      actual: pct(actual),
      paceLabel: ptsGap == null ? null : `${ptsGap >= 0 ? "+" : ""}${ptsGap.toFixed(1)} pt`,
      paceCls: good == null ? MUTE : good ? EMERALD : BRICK,
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

  const dotCls = (cls: string) =>
    cls === EMERALD ? "bg-emerald-500" : cls === AMBER ? "bg-amber-500" : cls === BRICK ? "bg-brick" : "bg-slate-300";

  // Consistency signal: the goal-anchored sales target (goal ÷ avg sale) and the
  // funnel flow (demos × close %) should agree. A material gap means this market's
  // demo % / close % / NSLI / average-sale assumptions are internally inconsistent.
  const divergence = d.sales_target_divergence_pct;
  const showDivergence = divergence != null && divergence > 20;

  return (
    <ScSection
      id="sc-funnel"
      label="Funnel vs Goal"
      meta="Actual measured against the prorated (MTD) target"
    >
      {showDivergence && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
          The sales target (goal ÷ average sale) and the funnel flow (demos × close %) differ by{" "}
          {divergence!.toFixed(0)}% — this market&apos;s demo %, close %, NSLI, or average sale may be inconsistent.
        </div>
      )}
      <div className="overflow-x-auto border-t border-slate-100 px-2 py-1 dark:border-slate-800/70 sm:px-4 sm:py-2">
        <table className="w-full min-w-0 text-[13px] sm:min-w-[480px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-2 py-2.5 text-left font-semibold sm:px-3">Metric</th>
              {/* Period Goal is secondary — hidden on phones so Actual/Pace fit without scroll */}
              <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Period Goal</th>
              <th className="px-2 py-2.5 text-right font-semibold sm:px-3">
                <span className="inline-flex items-center gap-1" title="Monthly goal scaled to selling days elapsed.">
                  Target to Date
                  <span className="text-slate-400" aria-hidden>ⓘ</span>
                </span>
              </th>
              <th className="px-2 py-2.5 text-right font-semibold sm:px-3">Actual</th>
              <th className="px-2 py-2.5 text-right font-semibold sm:px-3">Pace</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {rows.map((row, i) => (
              <tr
                key={row.metric}
                className={`border-t border-slate-50 dark:border-slate-900 ${i === 4 ? "border-t-2 border-t-slate-200 dark:border-t-slate-700" : ""}`}
              >
                <td className="px-2 py-2 font-sans font-medium text-slate-700 dark:text-slate-200 sm:px-3">{row.metric}</td>
                <td className="hidden px-3 py-2 text-right text-slate-500 dark:text-slate-400 sm:table-cell">{row.monthly ?? "—"}</td>
                <td className="px-2 py-2 text-right text-slate-500 dark:text-slate-400 sm:px-3">{row.targetToDate ?? "—"}</td>
                <td className="px-2 py-2 text-right font-semibold text-slate-900 dark:text-slate-100 sm:px-3">{row.actual}</td>
                <td className={`px-2 py-2 text-right font-medium sm:px-3 ${row.paceCls}`}>
                  {row.paceLabel ? (
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${dotCls(row.paceCls)}`} />
                      {row.paceLabel}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScSection>
  );
}
