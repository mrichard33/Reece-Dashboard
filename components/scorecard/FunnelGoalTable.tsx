import { num, usDate } from "@/lib/utils";
import { pct } from "./format";
import { ScSection } from "./ScSection";
import { InfoPopover } from "@/components/help/InfoPopover";
import { METRIC_LABELS, METRIC_FORMULAS } from "@/lib/scorecard/labels";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ② — Funnel vs Goal.
 *
 * ══ ONE PANEL, ONE POPULATION (Amendment B0, refined by C0) ══
 *
 * A panel must not merely contain individually valid KPIs; it must tell one
 * coherent story about one population. Two classes of row live here, and the
 * split is STRUCTURAL rather than a footnote:
 *
 *   PERFORMANCE — "what did this population do?" Issued, Demos, Sales, Demo %,
 *                 Demo → Sale %. These must share one source, cohort and grain.
 *   PLANNING    — "what does the goal require?" Leads. Derived from historical
 *                 economics, and legitimately on a different cohort (C0).
 *
 * ⚠️ THE PERFORMANCE ROWS MOVED OFF THE LIVE SYNC (2026-08-13).
 *
 * B4 described them as already coming from report 137. They did not — A2
 * repointed ⑤ By Market only, and this panel still read `view.actuals`
 * (`lp_market_scorecard_daily`, the live LP API sync) while By Market read the
 * cohort. Two funnels for one month, on one page. Company-wide August:
 *
 *     live sync  (as-of 08-11, what this panel showed)  595 issued · 102 sales
 *     137 cohort (observed 08-12, what ⑤ showed)        674 issued · 109 sales
 *
 * They now both read the cohort, summed by the page from the same rows that
 * produce Net Sales. Per-market the move is larger than the company figure
 * suggests — ORL 71 → 119 issued, FTLAU 33 → 54 — so pace gaps shift and some
 * negative ones close. That is a restatement, not an improvement, and it is
 * written up in the PR rather than left for a manager to discover.
 *
 * ⚠️ OUT_OF_AREA and UNASSIGNED have NO 137 cohort. Their funnel reads
 * unmeasured rather than falling back to the sync — a fallback would put a
 * live-sync count in a row labelled 137, which is the defect this change
 * exists to remove.
 *
 * ── B3: Good Rate % and KO % are GONE ───────────────────────────────────────
 * Neither is in the v4 or Amendment A metric set, and both were redundant:
 *   • Good Rate % = Net Retention % with the Financing Denied term dropped.
 *     Net Retention % `(GSA − GSACancelled − GSACD) ÷ GSA` is contracted,
 *     correctly sourced from 137, and strictly more complete.
 *   • KO % = the cancellation half of Permanent Loss %
 *     `(GSACancelled + GSACD) ÷ GSA`, which is also contracted.
 * Good Rate % also rendered 95.5% for August against 137's gross-after-cancels
 * of 90.0% — it was not reading 137 at all. Removal loses nothing measurable.
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
  /**
   * C0 — a PLANNING row, answering "what does the goal require?" rather than
   * "what did this population do?". Rendered in its own block above a rule,
   * with its own basis label, because it sits on a different cohort from the
   * performance rows and that difference must be structural, never implicit.
   */
  planning?: boolean;
  /** Source · cohort, on screen. Planning rows carry their own; C0 requires it. */
  basis?: string;
};

const r0 = (v: number) => Math.round(v);

const EMERALD = "text-emerald-600 dark:text-emerald-400";
const AMBER = "text-amber-600 dark:text-amber-400";
const BRICK = "text-brick";
const MUTE = "text-slate-400";

/**
 * Report 137's appointment cohort for this market and period, summed by the
 * page from the same rows that feed Net Sales and ⑤ By Market. Null counts mean
 * a month in range carried no count — unmeasured, never zero.
 */
export type CohortFunnel = {
  issued: number | null;
  demos: number | null;
  sales: number | null;
  /** MAX coverage across the months in range — what the subtitle dates. */
  dataThrough: string | null;
};

export function FunnelGoalTable({
  view,
  vm,
  cohortFunnel,
}: {
  view: ScorecardView;
  vm: ScorecardVM;
  cohortFunnel: CohortFunnel;
}) {
  const { goals: g, derived: d } = view;
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

  /**
   * A count row whose ACTUAL is measured but whose TARGET does not exist and is
   * not going to. Distinct from `countRow` with a null per-day figure, which
   * means "not sourced yet" — this means "not computable, and here is why".
   */
  const unmeasuredTargetRow = (
    metric: string,
    actual: number | null,
    reason: string,
    infoKey?: string,
  ): Row => ({
    metric,
    monthly: null,
    targetToDate: null,
    actual: actual == null ? "—" : num(actual),
    paceLabel: `not measured — ${reason}`,
    paceCls: MUTE,
    infoKey,
  });

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

  // ── PLANNING (C0) — a different cohort, separated structurally ────────────
  //
  // ⚠️ THE LEADS TARGET IS BLANK BECAUSE IT IS BLOCKED, not because it is
  // missing — which is why Target-to-Date and Pace read "not measured".
  //
  // It used to be issues-needed ÷ a historical issue rate, dividing an
  // APPOINTMENT-grain numerator by a LEAD-grain rate. That is deleted and stays
  // deleted (B1): do NOT reinstate `issue_rate` or `raw_leads_needed` in any
  // form, and do not approximate a target.
  //
  // C1 changed the REASON, not the state. The blocker is no longer "the grain
  // bridge is unproven" — C3 abandons the bridge entirely in favour of
  // Net Sales $ ÷ Raw Leads, one ratio absorbing every downstream loss. What
  // now blocks it is C2's four gates on report 135: row grain, cohort date
  // basis (needs the PDF header read), reconciliation of 135 `NetAmount`
  // against 137, and cohort compatibility with the goal. Until those pass, the
  // copy has to name the real blocker or the next person solves the old one.
  //
  // The ACTUAL still renders — report 135 via the view model, NOT
  // `a.raw_leads_in`, which is NULL for every market and which numOr0() once
  // turned into a confident zero.
  const planningRows: Row[] = [
    {
      ...unmeasuredTargetRow("Leads", leads, "pending Report 135 validation", "scorecard.leadsGoal"),
      planning: true,
      basis: "Report 135 · lead cohort · planning requirement, not a 137 target",
    },
  ];

  // ── PERFORMANCE — one population, one source, one cohort ──────────────────
  //
  // Report 137's appointment cohort, summed by the page. Every row below is the
  // same population: the appointments that OCCURRED in this period, and the
  // outcomes those appointments produced.
  //
  // ⚠️ THE RATES ARE DERIVED HERE, not read from `view.actuals`. `a.demo_pct`
  // and `a.close_pct` are live-sync rates over live-sync counts; pairing either
  // with a 137 count would put a numerator and a denominator from different
  // populations in one cell — the §7 defect, one level down from the panel.
  // Same reason `d.variance.*` is not used: it is `live actual − target`, so it
  // would report a gap against a number no longer on screen.
  const { issued, demos, sales } = cohortFunnel;
  const ratio = (n: number | null, dn: number | null): number | null =>
    n == null || dn == null || dn <= 0 ? null : Math.round((n / dn) * 1000) / 10;
  const demoPct = ratio(demos, issued);
  const demoToSalePct = ratio(sales, demos);
  const gap = (actual: number | null, target: number) =>
    actual == null ? null : Math.round((actual - target) * 10) / 10;

  const performanceRows: Row[] = [
    countRow("Issued", issued, d.target_issued_per_day),
    countRow("Demos", demos, d.target_demoed_per_day),
    countRow("Sales", sales, d.target_closed_per_day),
    // `close_pct` is sales ÷ demos and always has been. The Monday a.m. report
    // means sales ÷ leads ISSUED by "Close %", so this row no longer borrows
    // that name — see lib/scorecard/labels.ts. Definition unchanged; only the
    // population it is computed over moved.
    rateRow(METRIC_LABELS.demoToSale, demoToSalePct, g.target_close_pct, gap(demoToSalePct, g.target_close_pct), true, METRIC_FORMULAS.demoToSale),
    rateRow(METRIC_LABELS.demo, demoPct, g.target_demo_pct, gap(demoPct, g.target_demo_pct), true, METRIC_FORMULAS.demo),
  ];

  const rows: Row[] = [...planningRows, ...performanceRows];
  // Index of the first performance row — the structural rule C0 requires sits
  // above it. Derived, never hardcoded: a literal index silently re-draws the
  // planning/performance boundary in the wrong place the moment a row moves.
  const firstPerformance = planningRows.length;

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
      // B4 — the panel states its own basis, not just each row's. A correct row
      // inside a mislabelled panel still misleads, which is why there is a test
      // on this string and not only on the per-row labels.
      //
      // It dates the cohort's OWN coverage, not `vm.snapshot.asOfDate` (the
      // live-sync watermark). Those differ, and dating 137 figures with the
      // sync's date is the same class of error as labelling their source wrong.
      meta={`Report 137 · appointment-date cohort · ${vm.abbr}${
        cohortFunnel.dataThrough ? ` · through ${usDate(cohortFunnel.dataThrough)}` : ""
      } · Leads is a planning row (report 135)`}
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
                className={`border-t border-slate-50 dark:border-slate-900 ${i === firstPerformance ? "border-t-2 border-t-slate-300 dark:border-t-slate-600" : ""}`}
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
                  {/* C0 — a planning row states its own source and cohort on
                      screen. It sits on a different population from the
                      performance block below it, and a reader who cannot see
                      that will read the two as one funnel. */}
                  {row.basis && (
                    <span className="mt-0.5 block font-sans text-[10px] font-normal italic text-slate-400 dark:text-slate-500">
                      {row.basis}
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
