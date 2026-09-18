import { num, usd, usDate } from "@/lib/utils";
import { pct } from "./format";
import { ScSection } from "./ScSection";
import { InfoPopover } from "@/components/help/InfoPopover";
import { METRIC_LABELS, METRIC_FORMULAS } from "@/lib/scorecard/labels";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";
import type { LeadRate, LeadTarget } from "@/lib/scorecard/leadRate";
import type { Measured } from "@/lib/scorecard/tiers/types";

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

/**
 * The Leads planning row's inputs, computed by the page (E1–E3).
 *
 * Passed in rather than derived here for the same reason `cohortFunnel` is: the
 * page already holds the cohorts, the fact rows and the selling calendar, and
 * re-deriving any of them in a component is how two sections of one page come
 * to disagree about the same figure.
 *
 * `rate` rides along beside `target` so the row can state its own provenance —
 * dollars per lead, how many settled months it rests on, and whether the market
 * fell back to the company rate.
 */
export type LeadPlan = {
  target: Measured<LeadTarget>;
  rate: Measured<LeadRate>;
};

export function FunnelGoalTable({
  view,
  vm,
  cohortFunnel,
  leadPlan,
}: {
  view: ScorecardView;
  vm: ScorecardVM;
  cohortFunnel: CohortFunnel;
  leadPlan: LeadPlan;
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

  // ── count rows: goal = the UNROUNDED full-period total (monthly) or that
  //    total prorated over elapsed ÷ selling days (target-to-date).
  //    A miss on a volume row is amber (recoverable), matching the approved design.
  //
  // Ruling 2026-09-18 — NOT per-day × days. The per-day figure is rounded to 0.1
  // for display, so scaling it up baked that rounding into every day and left
  // Period Goal disagreeing with both the dollar goal and the hero tile.
  const countRow = (metric: string, actual: number | null, total: number | null, infoKey?: string): Row => {
    const ttdRaw = total == null || sellingDays <= 0 ? null : total * (daysElapsed / sellingDays);
    const ttd = ttdRaw == null ? null : r0(ttdRaw);
    const monthly = total == null ? null : r0(total);
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
  // ⚠️ SHIPPED 2026-08-15 (Amendment E0–E3). This row rendered "not measured —
  // pending Report 135 validation" from C1 until now, and showing a Leads
  // period goal, target-to-date and pace is the founding purpose of this
  // scorecard.
  //
  // It used to be issues-needed ÷ a historical issue rate, dividing an
  // APPOINTMENT-grain numerator by a LEAD-grain rate. That is deleted and stays
  // deleted (B1): do NOT reinstate `issue_rate`, `raw_leads_needed`, or
  // `derived.target_leads_per_day` — the last still exists on the type and is
  // the same defect in a field.
  //
  // What unblocked it is E1, not new data. The rate takes its NUMERATOR from
  // 137 and only its lead COUNT from 135, so 135's `NetAmount` is never
  // consumed and C2's Gate 3 — reconciling 135 dollars against 137 — is retired
  // rather than satisfied. Gate 1 is met by counting DISTINCT leads (January is
  // 10,032 rows over 9,387 leads; counting rows would overstate leads 6.9% and
  // understate the target by the same amount). Gate 2 is C0's carve-out, which
  // is why this row sits above a rule with its own basis label.
  //
  // ⚠️ EXPECT A LARGE GAP, and do not rescale the goal to close it (E3): a
  // ~$11.0M company goal implies ~15,000 leads/month against a run rate near
  // 10,000. Surfacing that is the point of the row.
  //
  // The ACTUAL is DISTINCT leads — the same expression the rate's denominator
  // uses, which is what keeps the two in one unit — via the view model, NOT
  // `a.raw_leads_in`, which is NULL for every market and which numOr0() once
  // turned into a confident zero.
  const planningRows: Row[] = [(() => {
    const basis =
      "Report 135 · lead cohort · planning requirement, not a 137 target" +
      (leadPlan.rate.known
        ? ` · ${usd(Math.round(leadPlan.rate.value.rate))}/lead over ${leadPlan.rate.value.cohortCount} settled ${
            leadPlan.rate.value.cohortCount === 1 ? "month" : "months"
          }${leadPlan.rate.value.ownRate ? "" : ", company rate"}`
        : "");

    if (!leadPlan.target.known) {
      return {
        ...unmeasuredTargetRow("Leads", leads, leadPlan.target.reason, "scorecard.leadsGoal"),
        planning: true,
        basis,
      };
    }
    const t = leadPlan.target.value;
    // Colour on the pace delta, exactly as `countRow` does for the volume rows:
    // a miss on a volume row is amber (recoverable), never red. The NUMBER is
    // rendered whatever the colour — E3 requires the gap be visible, and a
    // colour alone is not a figure a manager can act on.
    return {
      metric: "Leads",
      monthly: num(r0(t.periodGoal)),
      targetToDate: num(r0(t.targetToDate)),
      actual: leads == null ? "—" : num(leads),
      paceLabel:
        t.paceDelta == null ? null : `${t.paceDelta >= 0 ? "+" : ""}${num(r0(t.paceDelta))} vs pace`,
      paceCls: t.paceDelta == null ? MUTE : t.paceDelta >= 0 ? EMERALD : AMBER,
      infoKey: "scorecard.leadsGoal",
      planning: true,
      basis,
    };
  })()];

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
    countRow("Issued", issued, d.target_issued_total),
    countRow("Demos", demos, d.target_demoed_total),
    countRow("Sales", sales, d.target_closed_total),
    // `close_pct` is sales ÷ demos and always has been. The Monday a.m. report
    // means sales ÷ leads ISSUED by "Close %", so this row no longer borrows
    // that name — see lib/scorecard/labels.ts. Definition unchanged; only the
    // population it is computed over moved.
    // Goal = sales needed ÷ demos needed, so Demos goal × this = Sales goal
    // (Aug company: 779 ÷ 2,232 = 34.9%, against a stored target of 30%). The
    // stored target is the fallback only, for when no chain is computable — it
    // is also not uniform across offices (SAR carries 45%), so it could never
    // have tied the company's demos to the company's sales.
    rateRow(
      METRIC_LABELS.demoToSale,
      demoToSalePct,
      d.planning_demo_to_sale_pct ?? g.target_close_pct,
      gap(demoToSalePct, d.planning_demo_to_sale_pct ?? g.target_close_pct),
      true,
      METRIC_FORMULAS.demoToSale,
    ),
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
