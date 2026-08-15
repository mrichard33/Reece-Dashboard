/**
 * NET SALES $ PER RAW LEAD — the rate that makes the Leads target computable.
 *
 * ══ WHY THIS EXISTS (Amendment E0/E1) ══
 *
 * Showing a Leads period goal, target-to-date and pace is the founding purpose
 * of this scorecard, and it is the one row that never worked. C2 gated it behind
 * four checks on report 135. E1 dissolves three of them by changing where each
 * side of the ratio comes from:
 *
 *     net_sales_per_raw_lead = Σ Net Sales $ (REPORT 137)
 *                              ÷ Σ distinct leads (REPORT 135)
 *
 * The numerator is 137's, so 135's `NetAmount` is never consumed and C2's Gate 3
 * — reconciling 135 dollars against 137 — is RETIRED rather than satisfied. Do
 * not reconcile it, and do not "improve" this by sourcing the numerator from 135
 * because both sides would then come from one report: that would put a
 * lead-cohort dollar over a lead-cohort lead and lose the only thing this ratio
 * is for, which is converting a 137 NET SALES GOAL into a lead requirement.
 *
 * ══ THE TWO SIDES ARE ON DIFFERENT COHORTS, DELIBERATELY ══
 *
 * 137 is the appointment cohort; 135 is the lead cohort. C0 permits a PLANNING
 * metric to span cohorts provided the distinction is structural and labelled,
 * which is why the Leads row renders in its own block above a rule and carries
 * "Report 135 · lead cohort · planning requirement, not a 137 target". This is
 * NOT a performance rate and must never be presented as one — it is the historic
 * economics of a lead, used to size a goal.
 *
 * ⚠️ This is therefore NOT the §13 grain bridge, and does not unblock it. The
 * bridge would divide a lead count into an APPOINTMENT count; nothing here does
 * that, and `Leads` and `Issued` still may not be divided into one another.
 *
 * ══ SUM, THEN DIVIDE ══
 *
 * Σ numerators ÷ Σ denominators, never the mean of the monthly rates. Over
 * Jan–May the two differ by $14 — $735.95 against $750.01 — because averaging
 * weights a light month equally with a heavy one. §11 applies to this ratio
 * exactly as it applies to dollars.
 *
 * ══ ELIGIBILITY IS THE COHORT RULE, REUSED ══
 *
 * A cohort feeds the rate only once it is old enough to have settled, on the
 * same start-anchored 90-day window `settledNetRetention` already uses
 * (`MATURE_RATE_ELIGIBILITY_DAYS`). Measured 2026-08-13 that is Jan–May; June
 * (69 days) and July (39) are excluded. A young cohort reads TOO GOOD — losses
 * accrue over time — so including one would understate the lead requirement,
 * which is the direction that flatters the plan.
 *
 * Pure: no DB imports, dates injected, so `vitest` can pin the arithmetic.
 */

import {
  MATURE_RATE_ELIGIBILITY_DAYS,
  isEligibleForMatureRate,
  netSalesCents,
  type CohortObservation,
} from "@/lib/queries/cohorts.core";
import type { ReportFactRow } from "@/lib/queries/reportFacts.core";
import { marketSources } from "@/lib/scorecard/markets";
import { measured, unmeasured, type Measured } from "@/lib/scorecard/tiers/types";

/**
 * Below this many distinct leads in the eligible window, a market does not get
 * its own rate — it falls back to the company's and the row is marked.
 *
 * Mirrors `MIN_GROSS_FOR_OWN_RATE_CENTS`: a rate built on a handful of leads is
 * noise presented as measurement, and here it would propagate straight into a
 * goal someone is held to. Set against the observed spread — the smallest
 * market carries a few hundred leads a month, so five months of a genuine
 * market clears this comfortably while a utility row (UNASSIGNED / OUT_OF_AREA)
 * does not.
 */
export const MIN_LEADS_FOR_OWN_RATE = 1_000;

export type LeadRate = {
  /** Net Sales DOLLARS per distinct lead. Dollars, not cents. */
  rate: number;
  /** Distinct cohort months behind the rate — the honest sample size. */
  cohortCount: number;
  netSalesCents: number;
  distinctLeads: number;
  eligibilityDays: number;
  months: string[];
  /** False when this market fell back to the company rate. The row must say so. */
  ownRate: boolean;
};

/** Markets whose fact rows roll up to a dashboard market code. */
function inMarket(marketCode: string): (m: string) => boolean {
  if (marketCode === "REECE") return () => true; // company = Σ everything
  const sources = new Set(marketSources(marketCode));
  return (m) => sources.has(m);
}

/**
 * Distinct leads per LEAD-COHORT MONTH for one dashboard market.
 *
 * Reads `scope === 'month'` rows only. The `mtd` and `ytd` snapshots answer
 * different windows and would double-count against the month series — the same
 * rule `pickSnapshot` enforces for the panels, applied here where the shape is
 * a per-month series rather than one period.
 *
 * ⚠️ SUMMING BRANCH ROWS IS CORRECT, and only because of LP-MCP's owning-branch
 * fold. `leads_distinct` is emitted one row per lead, assigned to the branch of
 * that lead's LOWEST `row_num` (2026-08-13d), so the branch rows partition the
 * leads and Σ branches EQUALS the company distinct count. Without that fold the
 * 429 leads appearing under two branches would be counted twice here. See
 * `assertLeadDistinctAdditive`.
 */
export function distinctLeadsByMonth(
  rows: readonly ReportFactRow[],
  marketCode: string,
): Map<string, number> {
  const keep = inMarket(marketCode);
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.report_type !== "lead_disposition") continue;
    if (r.metric !== "leads_distinct") continue;
    if (r.scope !== "month") continue;
    if (!keep(r.market)) continue;
    out.set(r.period_start, (out.get(r.period_start) ?? 0) + r.value_count);
  }
  return out;
}

/**
 * Σ Net Sales (137) ÷ Σ distinct leads (135) over cohorts old enough to settle.
 *
 * `cohorts` must already be folded to the market being asked about — same
 * contract as `settledNetRetention`, which this deliberately mirrors so the two
 * published rates cannot drift apart in how they select their sample.
 *
 * A month joins the rate only when BOTH sides are present. Taking a cohort's
 * net sales while its lead count is missing would divide five months of dollars
 * by four months of leads and overstate the rate — which understates the lead
 * requirement, so it fails in the flattering direction and must be refused.
 */
export function netSalesPerRawLead(
  cohorts: readonly CohortObservation[],
  factRows: readonly ReportFactRow[],
  asOf: string,
  marketCode: string,
  companyFallback?: Measured<LeadRate>,
  eligibilityDays: number = MATURE_RATE_ELIGIBILITY_DAYS,
): Measured<LeadRate> {
  const leadsByMonth = distinctLeadsByMonth(factRows, marketCode);

  const eligible = cohorts.filter((c) =>
    isEligibleForMatureRate(c.appointmentMonth, asOf, eligibilityDays),
  );
  if (eligible.length === 0) {
    return unmeasured<LeadRate>(
      `no cohort is at least ${eligibilityDays} days old as of ${asOf}, so there is ` +
        `no settled history to derive a lead rate from`,
    );
  }

  let net = 0;
  let leads = 0;
  const months = new Set<string>();
  const missingLeads: string[] = [];
  for (const c of eligible) {
    const n = netSalesCents(c);
    if (n == null) continue; // incomplete Net Sales — see cohorts.core §"unknown, not zero"
    const l = leadsByMonth.get(c.appointmentMonth);
    if (l == null || l <= 0) {
      missingLeads.push(c.appointmentMonth);
      continue;
    }
    net += n;
    leads += l;
    months.add(c.appointmentMonth);
  }

  if (leads <= 0) {
    return unmeasured<LeadRate>(
      missingLeads.length > 0
        ? `report 135 publishes no distinct lead count for ${missingLeads.join(", ")}, ` +
            `so the lead rate has no denominator`
        : `the ${eligible.length} eligible cohort(s) carry no usable Net Sales with a ` +
            `distinct lead count beside them`,
    );
  }

  // Too thin to stand on its own → the company rate, marked. Never a blend.
  if (leads < MIN_LEADS_FOR_OWN_RATE && companyFallback) {
    return companyFallback.known
      ? measured({ ...companyFallback.value, ownRate: false })
      : companyFallback;
  }

  return measured({
    rate: net / 100 / leads,
    cohortCount: months.size,
    netSalesCents: net,
    distinctLeads: leads,
    eligibilityDays,
    months: [...months].sort(),
    ownRate: true,
  });
}

/**
 * The three published figures (Amendment E3).
 *
 * `periodGoalDollars` is the UNPRORATED goal for the whole selected period
 * (`derived.period_goal_dollars`) — for a month view that is the month's net
 * goal, for YTD the Σ of its months. Prorating happens here, once, from selling
 * days, exactly as the count rows beside it do.
 *
 * ⚠️ Do NOT source this from `derived.target_leads_per_day`. That figure is
 * issues-needed ÷ a historical ISSUE RATE — an appointment-grain numerator over
 * a lead-grain rate — which B1 deleted for being the §13 bridge in disguise. It
 * still exists on the type; it must not be read.
 */
export type LeadTarget = {
  periodGoal: number;
  targetToDate: number;
  /** actual − targetToDate. Null when the actual is unmeasured. */
  paceDelta: number | null;
  ownRate: boolean;
};

export function leadTarget(
  periodGoalDollars: number | null,
  rate: Measured<LeadRate>,
  elapsedSellingDays: number,
  periodSellingDays: number,
  actual: number | null,
): Measured<LeadTarget> {
  if (!rate.known) return unmeasured<LeadTarget>(rate.reason);
  if (periodGoalDollars == null || !(periodGoalDollars > 0)) {
    return unmeasured<LeadTarget>("this market has no net sales goal to convert into leads");
  }
  if (!(rate.value.rate > 0)) {
    return unmeasured<LeadTarget>("the measured lead rate is not positive");
  }
  if (!(periodSellingDays > 0)) {
    return unmeasured<LeadTarget>("the period has no selling days to prorate across");
  }

  const periodGoal = periodGoalDollars / rate.value.rate;
  const targetToDate = periodGoal * (elapsedSellingDays / periodSellingDays);
  return measured({
    periodGoal,
    targetToDate,
    paceDelta: actual == null ? null : actual - targetToDate,
    ownRate: rate.value.ownRate,
  });
}

/**
 * E7's additivity contract, as an assertion rather than a comment.
 *
 * ⚠️ THIS IS AN EQUALITY, AND IT HOLDS **BECAUSE OF** THE OWNING-BRANCH FOLD —
 * NOT AS A PROPERTY OF THE DATA. 429 leads genuinely appear under more than one
 * (market, branch) inside a snapshot, and a naive per-branch DISTINCT would
 * over-count: measured across current snapshots the naive sum exceeds the truth
 * by 26 (Jan), 7 (Aug MTD) and 208 (YTD). LP-MCP's `scorecard_rebuild_facts`
 * assigns each lead to the branch of its lowest `row_num`, which partitions the
 * leads and makes the branch rows sum EXACTLY to the company count.
 *
 * So: if you are reading this because the assertion fired, DO NOT relax it to
 * `<=`. Amendment E drafted it that way before accounting for the fold, and a
 * `<=` would silently tolerate exactly the regression this catches — the fold
 * breaking and every company Leads figure over-counting. Fix the fold.
 *
 * Returns the offending markets; empty means the contract holds.
 */
export function assertLeadDistinctAdditive(
  rows: readonly ReportFactRow[],
  marketCodes: readonly string[],
): { month: string; companyDistinct: number; marketSum: number }[] {
  const company = distinctLeadsByMonth(rows, "REECE");
  const perMarket = marketCodes.map((code) => distinctLeadsByMonth(rows, code));

  const out: { month: string; companyDistinct: number; marketSum: number }[] = [];
  for (const [month, companyDistinct] of company) {
    const marketSum = perMarket.reduce((a, m) => a + (m.get(month) ?? 0), 0);
    if (marketSum !== companyDistinct) out.push({ month, companyDistinct, marketSum });
  }
  return out;
}
