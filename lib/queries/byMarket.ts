import {
  getScorecardForPeriod,
  computeBaselineFromRows,
  type BaselineRow,
} from "@/lib/queries/scorecard";
import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { prorateGoal, revenueAnchorDate } from "@/lib/scorecard/paceTargets";
import { resolveSellingCalendar, sellingDaysElapsed } from "@/lib/date/sellingDays";
import {
  SCORECARD_MARKETS,
  UTILITY_MARKETS,
} from "@/lib/scorecard/markets";
import { fetchReportFactRows } from "@/lib/queries/reportFacts";
import { buildReportFacts } from "@/lib/queries/reportFacts.core";
import { fetchCurrentCohorts } from "@/lib/queries/cohorts";
import {
  netSalesCents,
  sumKnown,
  minCoverage,
  foldCohortsByMonth,
  type CohortObservation,
} from "@/lib/queries/cohorts.core";
import { assertNetActualMetric } from "@/lib/scorecard/goalBasis";
// `leadTarget` is deliberately NOT used here — see `leadPlanFor`, which divides
// the goal figures this row already carries so the Leads target inherits the
// dollar target's exact proration.
import { netSalesPerRawLead, type LeadRate } from "@/lib/scorecard/leadRate";
import type { Measured } from "@/lib/scorecard/tiers/types";

/**
 * By-Market rollup for the scorecard ⑤ table. For the default month-to-date
 * (snapshot) view this runs as THREE batched queries — all markets' latest
 * snapshot, all goals, all growth-baseline rows — and derives each market's goal
 * in-memory, instead of fanning out ~4 queries per market (the old path opened
 * ~40 concurrent queries, which is what made the page fragile). The goal math is
 * identical to lib/queries/scorecard (effective monthly goal × elapsed ÷ working
 * days), reusing the same baseline resolver. Aggregate / recompute periods keep the
 * per-market path (each call is wrapped so a bad market can never take down the page).
 *
 * The market list derives from lib/scorecard/markets (single source of truth):
 * one row per DISPLAY market — a merged market sums its source rows —
 * plus the Unassigned / Out-of-Area utility rows, which must surface visibly
 * whenever they carry activity. The All-Markets total's goal is the Σ of the
 * office rows' goals (derived, never the stored REECE goal row).
 */

const MARKETS: { code: string; label: string; sources: readonly string[]; utility?: boolean }[] = [
  ...SCORECARD_MARKETS.map((m) => ({ code: m.code, label: m.label, sources: m.sources })),
  // Sources, not [code]: UNASSIGNED and OUT_OF_AREA are one display entity
  // (§7 cardinality ruling), so both warehouse codes sum into the single row.
  ...UTILITY_MARKETS.map((m) => ({
    code: m.code,
    label: m.label,
    sources: m.sources as readonly string[],
    utility: true,
  })),
];

const ALL_CODES = ["REECE", ...MARKETS.flatMap((m) => m.sources)];

export type ByMarketRow = {
  market: string;
  label: string;
  utility: boolean;
  /**
   * DISTINCT leads from report 135 (lead_disposition), summed over the market's
   * branch-grain fact rows. NULL means "not sourced for this period" and MUST
   * render "—" with a reason.
   *
   * ⚠️ RE-BASED 2026-08-15 (Amendment E7). This was 135's ROW count; it is now
   * its LEAD count, and `leads_rows` below carries what this used to hold.
   * January reads 9,387 where it read 10,032. The re-base is what keeps this
   * figure in the same unit as the Leads target's denominator — see
   * lib/scorecard/leadRate.ts.
   *
   * Before that it read `raw_leads_in` off lp_market_scorecard_daily, which is
   * NULL for every market — coerced through numOr0() into a confident 0 leads
   * for every office while the company row showed a non-zero total (§4).
   */
  leads: number | null;
  /**
   * The same period at ROW grain, from the same report 135 rows, plus LP's own
   * count of duplicate records folded into a surviving lead.
   *
   * 135 is emitted at lead × disposition-state grain, so one lead contributes
   * many rows; `leads_rows` counts those. It is the SECONDARY figure now — two
   * counts of one period at two grains, NOT a numerator and a denominator.
   *
   * NULL = the snapshot predates LP-MCP publishing these; renders unmeasured.
   * 0 is a REAL answer (a period can genuinely have no duplicates), so absent
   * must never be coerced to it.
   */
  leads_rows: number | null;
  leads_superseded: number | null;
  /**
   * ── THE LEADS PLANNING FIGURES, PER OFFICE (Amendment E3) ─────────────────
   *
   * The Funnel vs Goal panel has carried these since E3, but only for the ONE
   * market selected — so the office-by-office view, which is where a manager
   * actually compares offices, showed a Leads actual with nothing to judge it
   * against. These put the requirement beside the actual on every row.
   *
   *   leads_target_period = this period's net goal ÷ Net Sales $ per raw lead
   *   leads_target_to_date = the same, prorated to selling days elapsed
   *   leads_pace_delta     = leads − leads_target_to_date
   *
   * NULL when the market has no goal (the utility rows) or no measurable rate —
   * a market with no settled cohort history cannot have a lead requirement
   * derived, and rendering 0 there would read as "needs no leads".
   *
   * ⚠️ The rate's denominator is DISTINCT leads, which is what `leads` above is
   * since E7. Pace is only meaningful because the two are in the same unit.
   */
  leads_target_period: number | null;
  leads_target_to_date: number | null;
  leads_pace_delta: number | null;
  /** False when this market borrowed the company rate — the cell must say so. */
  leads_rate_own: boolean;
  /** $ of Net Sales per distinct lead behind the target, for the tooltip. */
  leads_rate: number | null;
  /**
   * ── THE SALES FUNNEL, FROM REPORT 137 (Amendment A2) ──────────────────────
   *
   * Issued, Demos and Sales all come from `lp_cohort_maturation` — the SAME
   * report, the SAME appointment-date cohort and the SAME rows as Gross Written
   * and Net Sales beside them. That is the whole point: one row of this table
   * now describes one cohort instead of splicing live-sync counts onto 137
   * dollars and inviting a reconciliation that could never succeed.
   *
   * ⚠️ v4 §1 forbade exactly this, and Amendment A2 retires that rule. It was
   * right only while a single funnel was being made to serve both Sales and the
   * call center: 137 is appointment-dated, so it can answer for Sales and
   * cannot answer for setters, and forcing one funnel to do both is what made
   * its counts look untrustworthy.
   *
   * ⚠️ These will NOT reconcile to Appointment Statistics (report 138), and are
   * not meant to. Same window, same setters: 446 issued here against 418 there,
   * 271 sat against 260, with per-setter differences running in both
   * directions. Two cohort bases, two attributions. Do not build a
   * reconciliation view between them.
   *
   * NULL, never 0 — a market with no cohort row has not been measured. This is
   * a change from the old live-sync fields, which were coerced through
   * numOr0().
   */
  issued: number | null;
  demos: number | null;
  sales: number | null;
  /** Demos ÷ Issued, report 137. NOT "Company Demo %" — that is the call
   *  center's set-date metric and a different number (60.8% vs 62.2% on
   *  8/2–8/8). See lib/scorecard/labels.ts. */
  demo_pct: number | null;
  /** Sales ÷ Demos, report 137. NEVER "Close %", which is sales ÷ issued. */
  demo_to_sale_pct: number | null;
  /**
   * Gross Written from report 137, the base Net Sales is subtracted FROM.
   *
   * Sourced with `net_sales` deliberately: `lp_market_scorecard_daily.gross_sales`
   * disagrees with 137 on the same date (Fort Myers 2026-08-10: $851,565 vs
   * $873,208), and a Net Sales that cannot be derived from the Gross printed
   * beside it is the same mixing defect one row down. NULL = not sourced.
   */
  gross_sales: number | null;
  /**
   * NET SALES = Gross Written − Cancellations − Financing Denied, from report
   * 137 at market grain (`lp_cohort_maturation`), dated by CONTRACT date.
   *
   * ⚠️ This was `released_dollars` until 2026-08-13 — RTP, dated by production
   * milestone, so a contract sold in April landed in August. Orlando proved it
   * was not a sales figure: gross_sales $127,023 against net_sales $179,726, net
   * exceeding gross, which is impossible on a sales basis and routine on a
   * release basis. Fort Myers read $212,514 (26.6% of pace) and is $821,484
   * (102.7%). RTP still exists and still belongs on the Released panel.
   *
   * NULL, never 0: a market with no cohort row has not been measured.
   */
  net_sales: number | null;
  /** How far this market's Net Sales DATA reaches. Null = coverage undeclared. */
  net_sales_through: string | null;
  /** Prorated (to-date) goal for the period, if the market has a goal. */
  goal: number | null;
  /** Net as a % of the prorated goal, 0+ (null when no goal). */
  pctToGoal: number | null;
  // ── Display-only pace re-expression (no new goal math) ────────────────────
  // `pctToGoal` already divides by the PRORATED goal and `prorateGoal` is
  // linear, so with elapsedFrac = elapsed/workingDays:
  //
  //   pctToGoal   = 100 × net / (periodGoal × elapsedFrac)
  //   achievedPct = 100 × net /  periodGoal              = pctToGoal × elapsedFrac
  //
  // Both fall out of numbers already computed here. The colour bands still read
  // `pctToGoal`; these exist so the card can SAY what that ratio means instead
  // of captioning it "109% goal" on a market holding 25% of its money.
  /** Selling days elapsed as a % of selling days in the period. */
  elapsedPct: number | null;
  /** Net as a % of the FULL-period goal — what "% to goal" sounds like. */
  achievedPct: number | null;
  /** achievedPct − elapsedPct. Same sign as (pctToGoal − 100), always. */
  paceDeltaPts: number | null;
};

export type ByMarketView = { rows: ByMarketRow[]; total: ByMarketRow | null };

/**
 * Does a utility row (UNASSIGNED / OUT_OF_AREA) carry anything worth showing?
 * Includes net_sales: the old count-only check silently dropped a utility row
 * holding only dollars, hiding UNASSIGNED revenue from the table — UNASSIGNED
 * must stay visible so it can be driven to zero (handoff 2026-08-05).
 */
export function rowHasActivity(row: ByMarketRow): boolean {
  // Every term is null-coalesced: since A2 the funnel counts come from the 137
  // cohort and are NULL when unmeasured, where they used to be a coerced 0.
  // "Not measured" is not activity, and it is not a reason to hide the row's
  // dollars either — hence a sum across all six rather than a check on any one.
  return (
    (row.leads ?? 0) +
      (row.issued ?? 0) +
      (row.demos ?? 0) +
      (row.sales ?? 0) +
      (row.gross_sales ?? 0) +
      (row.net_sales ?? 0) !==
    0
  );
}

const numOr0 = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** A scorecard_goals row (only the fields the goal math needs). */
type GoalRow = {
  market: string;
  goal_mode: "dollars" | "growth_pct";
  monthly_goal_dollars: unknown;
  growth_pct: unknown;
  working_days: unknown;
};

/** Prorated to-date goal $ for ONE source market — mirrors derive() in
 *  lib/queries/scorecard via the shared prorateGoal helper. */
/**
 * Both goal figures for one source market.
 *
 * `prorated` is the to-date target the dollar columns pace against. `period` is
 * the SAME goal unprorated — the whole period's number. The Leads planning row
 * needs both: `period ÷ rate` is how many leads the period requires, and
 * `prorated ÷ rate` is how many it should have bought by now. Returning them
 * together keeps one derivation instead of letting a caller re-inflate the
 * prorated figure by the elapsed fraction and drift by a rounding.
 */
type MarketGoal = { prorated: number | null; period: number | null };

function mtdGoalFor(
  actualsRow: Record<string, unknown>,
  goalRow: GoalRow | undefined,
  baselineRows: BaselineRow[],
  periodStart: string,
  /**
   * Selling days elapsed through the market's NET SALES coverage date.
   *
   * ⚠️ Changed 2026-08-13. This used to be the `revenue_as_of` watermark,
   * because the row's actual was `released_dollars` and a released figure is
   * knowable only as far as the Net Report reaches. Net Sales is dated by
   * CONTRACT date and has no such watermark — it needs the date its own file
   * covers, which is report 137's `data_through`. Anchoring it to the RTP
   * watermark instead would prorate an August-10 numerator against an August-6
   * target and read every market ~40% high.
   *
   * Null → fall back to the snapshot's own elapsed, so a market with no cohort
   * row behaves exactly as it did before this existed.
   */
  netSalesElapsed: number | null,
): MarketGoal {
  if (!goalRow) return { prorated: null, period: null };
  const growth = numOrNull(goalRow.growth_pct);
  const effective =
    goalRow.goal_mode === "growth_pct" && growth != null
      ? Math.round(computeBaselineFromRows(baselineRows, periodStart).value * (1 + growth / 100))
      : numOr0(goalRow.monthly_goal_dollars);
  const wd = numOrNull(actualsRow.working_days_in_period) ?? numOr0(goalRow.working_days);
  const elapsed = netSalesElapsed ?? numOr0(actualsRow.days_elapsed);
  const prorated = prorateGoal(effective, elapsed, wd ?? 0);
  return {
    prorated: prorated == null ? null : Math.round(prorated),
    period: effective > 0 ? effective : null,
  };
}

/**
 * Report 137's figures for one display market, already at market grain.
 *
 * Dollars AND counts, deliberately together: under Amendment A2 they are one
 * cohort, and splitting them across two sources is the defect this type exists
 * to prevent recurring.
 */
export type MarketNetSales = {
  netSalesCents: number | null;
  grossCents: number | null;
  dataThrough: string | null;
  issuedCount: number | null;
  satCount: number | null;
  soldCount: number | null;
};

/**
 * The five funnel fields, derived from the 137 cohort and NOTHING else.
 *
 * ONE function, called by both row builders. They used to read `a.issued` /
 * `a.demos` / `a.sales` / `a.close_pct` off the live-sync row independently,
 * and two copies of a sourcing decision is how one of them gets repointed and
 * the other does not.
 *
 * Rates are derived from the SUMMED counts, never averaged across the market's
 * offices — §11 applies to counts exactly as it does to dollars.
 */
function funnelFromCohort(cohort: MarketNetSales | null): Pick<
  ByMarketRow,
  "issued" | "demos" | "sales" | "demo_pct" | "demo_to_sale_pct"
> {
  const issued = cohort?.issuedCount ?? null;
  const demos = cohort?.satCount ?? null;
  const sales = cohort?.soldCount ?? null;
  const ratio = (n: number | null, d: number | null): number | null =>
    n == null || d == null || d <= 0 ? null : Math.round((n / d) * 1000) / 10;
  return {
    issued,
    demos,
    sales,
    demo_pct: ratio(demos, issued),
    demo_to_sale_pct: ratio(sales, demos),
  };
}

/**
 * The Leads planning figures for one market (E3), derived from the goal already
 * computed for this row.
 *
 * ⚠️ DIVIDES THE GOAL FIGURES, rather than re-prorating from selling days.
 * `goal.prorated` is what the dollar columns on this very row pace against, so
 * dividing it by the rate makes the Leads target prorate over EXACTLY the same
 * days — including this market's own report-137 coverage anchor. Re-deriving the
 * proration here from `days_elapsed` would look equivalent and quietly disagree
 * on any market whose 137 file lags, putting two different elapsed fractions on
 * one row.
 */
export function leadPlanFor(
  goal: MarketGoal,
  rate: Measured<LeadRate>,
): Pick<
  ByMarketRow,
  "leads_target_period" | "leads_target_to_date" | "leads_pace_delta" | "leads_rate_own" | "leads_rate"
> {
  const none = {
    leads_target_period: null,
    leads_target_to_date: null,
    leads_pace_delta: null,
    leads_rate_own: false,
    leads_rate: null,
  };
  if (!rate.known || !(rate.value.rate > 0)) return none;
  const r = rate.value.rate;
  return {
    leads_target_period: goal.period == null ? null : Math.round(goal.period / r),
    leads_target_to_date: goal.prorated == null ? null : Math.round(goal.prorated / r),
    leads_pace_delta: null, // filled by the caller, which holds the actual
    leads_rate_own: rate.value.ownRate,
    leads_rate: Math.round(r),
  };
}

/**
 * Report 135 for one market, at BOTH grains it publishes. Passed as one object
 * rather than three positional args so a caller cannot line them up wrong —
 * `leads` and `distinct` are both plausible-looking counts of the same period.
 */
type MarketLeads = {
  /** DISTINCT lead count — the published actual since E7. See ByMarketRow.leads. */
  leads: number | null;
  /** Row count — the secondary figure. */
  rows: number | null;
  superseded: number | null;
};

function rowFromActuals(
  market: string,
  label: string,
  utility: boolean,
  a: Record<string, unknown>,
  goal: number | null,
  leads: MarketLeads,
  cohort: MarketNetSales | null,
  leadPlan: ReturnType<typeof leadPlanFor>,
): ByMarketRow {
  // NET SALES — Gross Written − Cancellations − Financing Denied, report 137.
  //
  // This assert is the enforcement point that was missing. `NON_GOAL_METRICS`
  // has rejected `released_dollars` by name since 2026-08-12, but nothing in
  // production ever called it, which is exactly why this file went on reading
  // RTP against a net goal for a day. Naming the metric here means a future
  // repoint to a non-net column fails loudly instead of silently re-basing
  // every market card.
  assertNetActualMetric("net_sales_cents", "ByMarketRow.net_sales");
  const net = cohort ? (cohort.netSalesCents == null ? null : Math.round(cohort.netSalesCents / 100)) : null;
  const gross = cohort ? (cohort.grossCents == null ? null : Math.round(cohort.grossCents / 100)) : null;
  const g = utility ? null : goal && goal > 0 ? goal : null;
  // Null net is UNMEASURED, not 0% — a market with no cohort row must not read
  // as total failure against its goal.
  const pctToGoal = g && net != null ? Math.round((net / g) * 1000) / 10 : null;
  return {
    market,
    label,
    utility,
    ...paceFields(a, pctToGoal),
    // Leads = report 135, passed in by the caller (see ByMarketRow.leads).
    // NEVER a.raw_leads_in — that column is NULL for every market.
    leads: leads.leads,
    leads_rows: leads.rows,
    leads_superseded: leads.superseded,
    ...leadPlan,
    // Pace needs BOTH sides, and only this function holds them. Null when either
    // is unmeasured — a market with no rate has no pace, and 0 would read as
    // "exactly on target".
    leads_pace_delta:
      leads.leads == null || leadPlan.leads_target_to_date == null
        ? null
        : leads.leads - leadPlan.leads_target_to_date,
    // A2: the funnel comes from the cohort, not from `a` (live sync). See
    // `funnelFromCohort` and ByMarketRow.issued.
    ...funnelFromCohort(cohort),
    gross_sales: gross,
    net_sales: net,
    net_sales_through: cohort?.dataThrough ?? null,
    goal: g,
    pctToGoal,
  };
}

/**
 * Report 137's Net Sales and Gross Written per DISPLAY market for a period.
 *
 * ⚠️ Keyed on the display market code, and NOT summed over `m.sources`. The
 * view has already rolled LP's office codes up to market grain — BOCA + FTLAU +
 * MIAMI (+ RFED when present) into FTLAU_MKT — so summing the sources here again
 * would double Fort Lauderdale. That the two vocabularies happen to be 1:1 for
 * every market today is not a reason to iterate sources; the rollup rule lives
 * in the database and this reads its output.
 *
 * Cohorts are keyed on CONTRACT month, so an aggregate period sums the months it
 * spans and each month's contracts stay in their own month forever.
 */
export function netSalesByMarket(
  cohorts: readonly CohortObservation[],
  periodStart: string,
  periodEnd: string,
): Map<string, MarketNetSales> {
  const inPeriod = cohorts.filter((c) => c.appointmentMonth >= periodStart && c.appointmentMonth <= periodEnd);
  const byMarket = new Map<string, CohortObservation[]>();
  for (const c of inPeriod) {
    const bucket = byMarket.get(c.market);
    if (bucket) bucket.push(c);
    else byMarket.set(c.market, [c]);
  }

  const out = new Map<string, MarketNetSales>();
  for (const [market, group] of byMarket) {
    out.set(market, {
      // sumKnown propagates null: one unmeasured month makes the total
      // unmeasured rather than quietly understating it.
      netSalesCents: sumKnown(group.map((c) => netSalesCents(c))),
      grossCents: sumKnown(group.map((c) => c.grossCents)),
      dataThrough: minCoverage(group.map((c) => c.dataThrough)),
      // Counts fold the same way as dollars — same rows, same rule. A month
      // whose file did not carry a count makes the total unknown rather than
      // silently smaller.
      issuedCount: sumKnown(group.map((c) => c.issuedCount)),
      satCount: sumKnown(group.map((c) => c.satCount)),
      soldCount: sumKnown(group.map((c) => c.soldCount)),
    });
  }

  // The company row is the sum of the markets, derived here rather than read
  // from a REECE cohort row — there isn't one; REECE is a rollup, not a market.
  const all = [...out.values()];
  if (all.length > 0) {
    out.set("REECE", {
      netSalesCents: sumKnown(all.map((v) => v.netSalesCents)),
      grossCents: sumKnown(all.map((v) => v.grossCents)),
      dataThrough: minCoverage(all.map((v) => v.dataThrough)),
      issuedCount: sumKnown(all.map((v) => v.issuedCount)),
      satCount: sumKnown(all.map((v) => v.satCount)),
      soldCount: sumKnown(all.map((v) => v.soldCount)),
    });
  }
  return out;
}

/**
 * The display-only pace re-expression. Separated so the All-Markets row — whose
 * goal is DERIVED as Σ of the offices and therefore recomputes `pctToGoal`
 * after the fact — can reuse the identical derivation instead of a second copy
 * that could drift.
 *
 * `elapsedPct` is a fact about the CALENDAR and survives a missing goal —
 * which matters, because the All-Markets row derives its goal after the fact
 * and would otherwise lose the elapsed figure it needs. `achievedPct` and the
 * delta are null without a goal: a 0% there would read as total failure rather
 * than "not measured".
 */
export function paceFields(
  a: Record<string, unknown>,
  pctToGoal: number | null,
): { elapsedPct: number | null; achievedPct: number | null; paceDeltaPts: number | null } {
  const elapsed = numOr0(a.days_elapsed);
  const wd = numOrNull(a.period_working_days) ?? numOrNull(a.working_days_in_period) ?? 0;
  if (wd <= 0) return { elapsedPct: null, achievedPct: null, paceDeltaPts: null };
  // Derive from the EXACT fraction, not from the rounded percentage — feeding a
  // 0.1-rounded elapsedPct back in compounds two roundings and can push the
  // delta a tenth off the true value on a market far from pace.
  const frac = elapsed / wd;
  return { elapsedPct: Math.round(frac * 1000) / 10, ...achievedCore(pctToGoal, frac) };
}

/**
 * achievedPct = pctToGoal × elapsedFrac — see the ByMarketRow note. Derived,
 * never re-divided, so it cannot disagree with the ratio driving the colour.
 *
 * The delta is computed as `elapsedFrac × (pctToGoal − 100)` rather than as
 * `achievedPct − elapsedPct`. Algebraically identical:
 *
 *     achieved − elapsed = f·p − 100f = f·(p − 100)
 *
 * but this form makes the sign PROPORTIONAL to (pctToGoal − 100) by
 * construction, so it can never contradict the colour band — subtracting two
 * separately-rounded percentages can.
 *
 * It can still round to 0.0 where the band is marginally off 100: at one
 * elapsed day of 26, a market at 99.9% of target is 0.004 points behind. The
 * caption says "on pace", which is true; the bar stays amber, which is also
 * true. Only a NONZERO delta is a claim, and a nonzero delta always agrees.
 */
function achievedCore(
  pctToGoal: number | null,
  frac: number | null,
): { achievedPct: number | null; paceDeltaPts: number | null } {
  if (pctToGoal == null || frac == null) return { achievedPct: null, paceDeltaPts: null };
  return {
    achievedPct: Math.round(pctToGoal * frac * 10) / 10,
    paceDeltaPts: Math.round(frac * (pctToGoal - 100) * 10) / 10,
  };
}

/**
 * Re-derivation for the All-Markets row, whose goal is summed from the offices
 * AFTER the row is built — by then only the rounded `elapsedPct` survives, so
 * this carries a tenth more slack than `paceFields`. Immaterial at display
 * resolution, and the sign is still proportional to (pctToGoal − 100).
 */
export function achievedFrom(
  pctToGoal: number | null,
  elapsedPct: number | null,
): { achievedPct: number | null; paceDeltaPts: number | null } {
  return achievedCore(pctToGoal, elapsedPct == null ? null : elapsedPct / 100);
}

/** Batched rollup for the snapshot (MTD) view — 3 queries, no per-market fan-out. */
async function getByMarketSnapshot(resolved: ResolvedPeriod): Promise<ByMarketView> {
  const sb = await lpServer();
  const periodStart = resolved.periodStart;

  const [{ data: actualsRows }, { data: goalRows }, { data: baseRows }, factRows, cohorts] = await Promise.all([
    // Every market's snapshots for this period; we keep the latest as_of per market.
    sb
      .from("lp_market_scorecard_daily")
      .select("*")
      .in("market", ALL_CODES)
      .eq("period_start", periodStart)
      .lte("as_of_date", resolved.asOf)
      .order("as_of_date", { ascending: false }),
    sb
      .from("scorecard_goals")
      .select("market, goal_mode, monthly_goal_dollars, growth_pct, working_days")
      .in("market", ALL_CODES),
    // Prior-period rows for the growth baselines (latest-first for the pure resolver).
    sb
      .from("lp_market_scorecard_daily")
      // ⚠️ KNOWN BASIS GAP (2026-08-13, follow-up). This column is RTP, so a
      // market on goal_mode='growth_pct' would derive a NET SALES goal from a
      // RELEASED baseline. Inert today — every market is on goal_mode='dollars'
      // — and repointing it needs prior-month cohort history per market, which
      // is a larger change than this one. Flagged rather than silently left.
      .select("market, net_sales, period_start, as_of_date")
      .in("market", ALL_CODES)
      .lt("period_start", periodStart)
      .order("period_start", { ascending: false })
      .order("as_of_date", { ascending: false })
      .limit(1000),
    // Report 135 leads — fetched ONCE and projected per market in memory.
    fetchReportFactRows(),
    // Report 137 cohorts — Net Sales and Gross Written, already at market grain.
    // Never rejects; [] leaves every dollar figure NULL and the cards render "—".
    fetchCurrentCohorts(),
  ]);

  // Leads come from report 135 only (§3 authoritative source, §4 repoint).
  const leadsFor = (code: string): MarketLeads => {
    const f = buildReportFacts(factRows, resolved, code).leads;
    return {
      leads: f?.leads ?? null,
      rows: f?.leadRows ?? null,
      superseded: f?.superseded ?? null,
    };
  };
  // The Leads rate per market (E1/E2). The COMPANY rate is computed first and
  // passed as the fallback, so a market too thin to carry its own borrows it
  // rather than rendering nothing — and `ownRate` marks which cells did.
  // Memoised: `buildRow` runs per market and the fold is not free.
  const companyRate = netSalesPerRawLead(
    foldCohortsByMonth(cohorts),
    factRows,
    resolved.asOf,
    "REECE",
  );
  const rateCache = new Map<string, Measured<LeadRate>>();
  const rateFor = (code: string): Measured<LeadRate> => {
    const hit = rateCache.get(code);
    if (hit) return hit;
    const r =
      code === "REECE"
        ? companyRate
        : netSalesPerRawLead(
            // Already at display-market grain in the view — filter, never
            // re-sum over `sources`, for the same reason `netSalesByMarket`
            // does not: that would double Fort Lauderdale.
            foldCohortsByMonth(cohorts.filter((c) => c.market === code)),
            factRows,
            resolved.asOf,
            code,
            companyRate,
          );
    rateCache.set(code, r);
    return r;
  };

  // Latest snapshot per SOURCE market (rows are as_of desc).
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of (actualsRows ?? []) as Record<string, unknown>[]) {
    if (!latest.has(String(r.market))) latest.set(String(r.market), r);
  }
  const goals = new Map<string, GoalRow>();
  for (const g of (goalRows ?? []) as GoalRow[]) goals.set(g.market, g);
  const baseByMarket = new Map<string, BaselineRow[]>();
  for (const r of (baseRows ?? []) as (BaselineRow & { market: string })[]) {
    const list = baseByMarket.get(r.market);
    if (list) list.push(r);
    else baseByMarket.set(r.market, [r]);
  }

  /** Sum a display market's source rows into one pseudo-actuals row. */
  const combinedActuals = (sources: readonly string[]): Record<string, unknown> | null => {
    const found = sources
      .map((s) => latest.get(s))
      .filter((r): r is Record<string, unknown> => !!r);
    if (found.length === 0) return null;
    if (found.length === 1) return found[0] ?? null;
    const sum = (f: string) => found.reduce((a, r) => a + numOr0(r[f]), 0);
    return {
      leads: sum("leads"),
      raw_leads_in: sum("raw_leads_in"),
      // ⚠️ THE FUNNEL COUNTS ARE DELIBERATELY ABSENT FROM THIS SUM, for the same
      // reason the dollar columns below are: since A2 they come from
      // `netSalesByMarket` (report 137), and leaving a live-sync `issued` /
      // `demos` / `sales` in this pseudo-row would put a second, differently
      // sourced copy one field lookup away from being read back in. Only the
      // pace/calendar fields this row is still consulted for remain.
      days_elapsed: Math.max(...found.map((r) => numOr0(r.days_elapsed))),
      working_days_in_period: Math.max(...found.map((r) => numOr0(r.working_days_in_period))) || null,
      // ⚠️ The DOLLAR columns are deliberately absent from this sum (2026-08-13).
      //
      // This table's `net_sales` IS `released_dollars` (`revenue_basis =
      // 'rtp_net_by_milestone_date'`), and `gross_sales` disagrees with report
      // 137 on the same date. Both now come from `netSalesByMarket`, so summing
      // them here would only leave a live-looking RTP figure one field lookup
      // away from being read back in — which is exactly how this row spent a day
      // pacing a sales goal against production releases.
      //
      // `revenue_as_of` goes with them: it is the RTP coverage watermark, and
      // the pace anchor is now report 137's `data_through`.
    };
  };

  // Calendar for the pace anchor. Server-side only, same env the writer reads.
  const cal = resolveSellingCalendar();
  const netByMarket = netSalesByMarket(cohorts, periodStart, resolved.periodEnd);

  const buildRow = (
    code: string,
    label: string,
    utility: boolean,
    sources: readonly string[],
  ): ByMarketRow | null => {
    const a = combinedActuals(sources);
    if (!a) return null;
    const cohort = netByMarket.get(code) ?? null;
    // The target stops where THIS market's Net Sales stops, so numerator and
    // denominator share a date.
    //
    // `revenueAnchorDate` is reused for its SHAPE, not its RTP meaning: "clamp
    // a source date that runs past the range end to the range end" is the same
    // refusal `reportingClock` makes, and duplicating it would be two ways to
    // say one thing. It keeps its name because the Released panel still uses it
    // for its own watermark — see docs/revenue-as-of.md. Do not "unify" the two
    // call sites into one anchor; that would drag production milestones back
    // onto the sales pace.
    const netElapsed = cohort?.dataThrough
      ? sellingDaysElapsed(periodStart, revenueAnchorDate(resolved.asOf, cohort.dataThrough), cal)
      : null;
    // Goal = Σ of the source markets' goals, at BOTH prorations.
    const goal: MarketGoal = { prorated: null, period: null };
    if (!utility) {
      for (const src of sources) {
        const g = mtdGoalFor(
          a,
          goals.get(src),
          baseByMarket.get(src) ?? [],
          periodStart,
          netElapsed,
        );
        if (g.prorated != null) goal.prorated = (goal.prorated ?? 0) + g.prorated;
        if (g.period != null) goal.period = (goal.period ?? 0) + g.period;
      }
    }
    return rowFromActuals(
      code,
      label,
      utility,
      a,
      goal.prorated,
      leadsFor(code),
      cohort,
      leadPlanFor(goal, rateFor(code)),
    );
  };

  const rows: ByMarketRow[] = [];
  for (const m of MARKETS) {
    const row = buildRow(m.code, m.label, !!m.utility, m.sources);
    if (!row) continue;
    // Utility rows only when they carry activity.
    if (m.utility && !rowHasActivity(row)) continue;
    rows.push(row);
  }
  // Unmeasured sorts last, not as if it were zero.
  rows.sort(
    (x, y) => Number(x.utility) - Number(y.utility) || (y.net_sales ?? -1) - (x.net_sales ?? -1),
  );

  // The All-Markets row keeps REECE's actuals, but its goal is DERIVED — the Σ of
  // the office rows' goals — so the total always equals the sum of its parts.
  const total = buildRow("REECE", "All Markets", false, ["REECE"]);
  if (total) {
    const officeGoalSum = rows.reduce((a, r) => (r.utility ? a : a + (r.goal ?? 0)), 0);
    total.goal = officeGoalSum > 0 ? officeGoalSum : null;
    total.pctToGoal =
      total.goal && total.net_sales != null
        ? Math.round((total.net_sales / total.goal) * 1000) / 10
        : null;
    // The derived goal changes the ratio, so the pace statement must follow it.
    // elapsedPct is calendar-only and already correct on the row.
    Object.assign(total, achievedFrom(total.pctToGoal, total.elapsedPct));
  }
  return { rows, total };
}

/** Per-market fetch that never rejects — a bad market must not take down the page. */
async function safeView(market: string, resolved: ResolvedPeriod) {
  try {
    return await getScorecardForPeriod(market, resolved);
  } catch (err) {
    console.error(`[byMarket] ${market} failed:`, (err as Error)?.message ?? err);
    return null;
  }
}

/** Fan-out rollup for aggregate / recompute periods (uncommon; kept for exact parity). */
async function getByMarketFanout(resolved: ResolvedPeriod): Promise<ByMarketView> {
  const [factRows, cohorts, reece, ...marketViews] = await Promise.all([
    // Report 135 leads — one fetch, projected per market in memory.
    fetchReportFactRows(),
    // Report 137 cohorts. Keyed on appointment month, so an aggregate period sums
    // the months it spans — cohort immutability means each month's contracts
    // stay in their own month however wide the window is.
    fetchCurrentCohorts(),
    safeView("REECE", resolved),
    ...MARKETS.map((m) => safeView(m.code, resolved)),
  ]);

  const leadsFor = (code: string): MarketLeads => {
    const f = buildReportFacts(factRows, resolved, code).leads;
    return {
      leads: f?.leads ?? null,
      rows: f?.leadRows ?? null,
      superseded: f?.superseded ?? null,
    };
  };
  const netByMarket = netSalesByMarket(cohorts, resolved.periodStart, resolved.periodEnd);
  // Same rate derivation as the snapshot path — see the note there.
  const companyRate = netSalesPerRawLead(
    foldCohortsByMonth(cohorts),
    factRows,
    resolved.asOf,
    "REECE",
  );
  const rateCache = new Map<string, Measured<LeadRate>>();
  const rateFor = (code: string): Measured<LeadRate> => {
    const hit = rateCache.get(code);
    if (hit) return hit;
    const r =
      code === "REECE"
        ? companyRate
        : netSalesPerRawLead(
            foldCohortsByMonth(cohorts.filter((c) => c.market === code)),
            factRows,
            resolved.asOf,
            code,
            companyRate,
          );
    rateCache.set(code, r);
    return r;
  };

  type V = NonNullable<Awaited<ReturnType<typeof getScorecardForPeriod>>>;
  const toRow = (market: string, label: string, utility: boolean, v: V): ByMarketRow => {
    const a = v.actuals as unknown as Record<string, unknown>;
    // ⚠️ `revenue_goal_to_date_dollars` is the RTP-anchored target and is no
    // longer the right denominator — this row's net is Net Sales, dated by
    // contract. Use the count-elapsed target instead, which is anchored to the
    // period's own as-of. The snapshot path re-anchors per market to report
    // 137's own coverage; this path cannot, because the aggregate view does not
    // carry a per-market coverage date, so it uses the period anchor and is
    // documented as the coarser of the two.
    const goal = utility ? null : v.derived.mtd_goal_dollars || null;
    // This path has the period goal directly from the view model, so both
    // prorations come from one place exactly as they do in the snapshot path.
    const goals: MarketGoal = {
      prorated: goal,
      period: utility ? null : v.derived.period_goal_dollars || null,
    };
    return rowFromActuals(
      market,
      label,
      utility,
      a,
      goal,
      leadsFor(market),
      netByMarket.get(market) ?? null,
      leadPlanFor(goals, rateFor(market)),
    );
  };

  const rows: ByMarketRow[] = [];
  marketViews.forEach((v, i) => {
    const m = MARKETS[i];
    if (!v || !m) return;
    const row = toRow(m.code, m.label, !!m.utility, v);
    if (m.utility && !rowHasActivity(row)) return;
    rows.push(row);
  });
  rows.sort(
    (x, y) => Number(x.utility) - Number(y.utility) || (y.net_sales ?? -1) - (x.net_sales ?? -1),
  );

  const total = reece ? toRow("REECE", "All Markets", false, reece) : null;
  return { rows, total };
}

export async function getByMarket(resolved: ResolvedPeriod): Promise<ByMarketView> {
  return resolved.source === "snapshot"
    ? getByMarketSnapshot(resolved)
    : getByMarketFanout(resolved);
}
