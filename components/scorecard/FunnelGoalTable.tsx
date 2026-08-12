import { num, usDate } from "@/lib/utils";
import { pct } from "./format";
import { ScSection } from "./ScSection";
import { InfoPopover } from "@/components/help/InfoPopover";
import { METRIC_LABELS, METRIC_FORMULAS } from "@/lib/scorecard/labels";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

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
  /** helpContent key for an (i) popover on the metric label. */
  infoKey?: string;
  /** Denominator, spelled out — every percentage must answer "percent of what?". */
  formula?: string;
};

const r0 = (v: number) => Math.round(v);

const EMERALD = "text-emerald-600 dark:text-emerald-400";
const AMBER = "text-amber-600 dark:text-amber-400";
const BRICK = "text-brick";
const MUTE = "text-slate-400";

export function FunnelGoalTable({ view, vm }: { view: ScorecardView; vm: ScorecardVM }) {
  const { actuals: a, goals: g, derived: d } = view;
  // Leads come from report 135, the same figure ⑤ By Market shows. Reusing the
  // view model's already-resolved value rather than re-deriving it is what keeps
  // the two sections from disagreeing on one page.
  const leads = vm.revenue.facts.leads;
  // Both day figures come from the view model, for the same reason the leads
  // figure above does: re-deriving them here is what lets two sections of one
  // page disagree. It also picked up `a.days_elapsed`, which freezes when the
  // feed stalls, and a `?? 26` denominator that quietly substitutes a
  // plausible-looking month for a missing one.
  const daysElapsed = vm.snapshot.daysElapsed;
  const sellingDays = vm.snapshot.sellingDays;

  // ── count rows: goal = per-day target × days (target-to-date) or × selling days (monthly).
  //    A miss on a volume row is amber (recoverable), matching the approved design.
  const countRow = (metric: string, actual: number | null, perDay: number | null, infoKey?: string): Row => {
    const ttd = perDay == null ? null : r0(perDay * daysElapsed);
    const monthly = perDay == null ? null : r0(perDay * sellingDays);
    const paceVal = ttd == null || actual == null ? null : actual - ttd;
    return {
      metric,
      monthly: monthly == null ? null : num(monthly),
      targetToDate: ttd == null ? null : num(ttd),
      actual: actual == null ? "—" : num(actual),
      paceLabel: paceVal == null ? null : `${paceVal >= 0 ? "+" : ""}${num(paceVal)} vs pace`,
      paceCls: paceVal == null ? MUTE : paceVal >= 0 ? EMERALD : AMBER,
      infoKey,
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
    formula?: string,
  ): Row => {
    const good = ptsGap == null ? null : higherIsBetter ? ptsGap >= 0 : ptsGap <= 0;
    return {
      metric,
      monthly: pct(target),
      targetToDate: pct(target),
      actual: pct(actual),
      paceLabel: ptsGap == null ? null : `${ptsGap >= 0 ? "+" : ""}${ptsGap.toFixed(1)} pt`,
      paceCls: good == null ? MUTE : good ? EMERALD : BRICK,
      formula,
    };
  };

  const rows: Row[] = [
    // Leads goal is DERIVED (ruled 2026-08-04): issues-needed ÷ historical
    // issue rate — it moves when the trailing issue rate moves, hence the (i).
    //
    // Actual comes from report 135 (lead_disposition), NOT `a.raw_leads_in`.
    // That column is NULL for every market, and numOr0() turned it into a
    // confident zero — so this table showed 0 (or the company figure) while ⑤ By
    // Market, already repointed at 135, showed the real per-office count. Two
    // lead numbers on one page, and the wrong one here. Null now renders "—".
    countRow("Leads", leads, d.target_leads_per_day, "scorecard.leadsGoal"),
    countRow("Issued", a.issued, d.target_issued_per_day),
    countRow("Demos", a.demos, d.target_demoed_per_day),
    countRow("Sales", a.sales, d.target_closed_per_day),
    // `close_pct` is sales ÷ demos and always has been. The Monday a.m. report
    // means sales ÷ leads ISSUED by "Close %", so this row no longer borrows
    // that name — see lib/scorecard/labels.ts. Computation unchanged.
    rateRow(METRIC_LABELS.demoToSale, a.close_pct, g.target_close_pct, d.variance.close_pts, true, METRIC_FORMULAS.demoToSale),
    rateRow(METRIC_LABELS.demo, a.demo_pct, g.target_demo_pct, d.variance.demo_pts, true, METRIC_FORMULAS.demo),
    rateRow(METRIC_LABELS.goodRate, a.good_rate_pct, g.target_good_rate_pct, d.variance.good_rate_pts, true, METRIC_FORMULAS.goodRate),
    rateRow(METRIC_LABELS.ko, a.ko_pct, g.target_ko_pct, d.variance.ko_pts, false, METRIC_FORMULAS.ko),
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
      // Every figure in this table comes from the live LP sync, which has no
      // report equivalent for counts or rates — so it cannot be repointed, only
      // stamped. A rate rendered bare is a rate presented as current.
      meta={`Actual vs the prorated ${vm.abbr} target · live sync through ${usDate(vm.snapshot.asOfDate)}`}
    >
      {showDivergence && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
          The sales target (goal ÷ average sale) and the funnel flow (demos × close %) differ by{" "}
          {divergence!.toFixed(0)}% — this market&apos;s demo %, demo &rarr; sale %, net $ per issued appointment, or average sale may be inconsistent.
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
                <td className="px-2 py-2 font-sans font-medium text-slate-700 dark:text-slate-200 sm:px-3">
                  <span className="inline-flex items-center gap-1">
                    <span title={row.formula}>{row.metric}</span>
                    {row.infoKey && <InfoPopover helpKey={row.infoKey} align="left" />}
                  </span>
                  {/* The denominator, on screen rather than in a tooltip only —
                      a rate whose basis you must hover to learn is a rate people
                      will misread. */}
                  {row.formula && (
                    <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-400 dark:text-slate-500">
                      {row.formula}
                    </span>
                  )}
                </td>
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
