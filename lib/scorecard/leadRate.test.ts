import { describe, test, expect } from "vitest";
import {
  netSalesPerRawLead,
  distinctLeadsByMonth,
  leadTarget,
  assertLeadDistinctAdditive,
  MIN_LEADS_FOR_OWN_RATE,
} from "@/lib/scorecard/leadRate";
import { buildReportFacts, type ReportFactRow } from "@/lib/queries/reportFacts.core";
import type { CohortObservation } from "@/lib/queries/cohorts.core";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * Amendment E1–E3 and E6.
 *
 * The numbers here are the LIVE warehouse figures as of 2026-08-13, not
 * invented fixtures — Jan–May Net Sales from `lp_cohort_maturation` and distinct
 * leads from `lp_report_facts`. If a change moves the published rate, one of
 * these fails with the real figure beside the expected one.
 */

/** Net Sales = gross − cancelled − cd, so the fixture states gross and losses. */
const cohort = (
  appointmentMonth: string,
  netSalesDollars: number,
  over: Partial<CohortObservation> = {},
): CohortObservation => ({
  appointmentMonth,
  market: "REECE",
  observedOn: "2026-08-13",
  dataThrough: "2026-08-13",
  officeCount: 9,
  // All loss in `cancelledCents` keeps the arithmetic obvious; netSalesCents()
  // subtracts cancelled + cd from gross, so gross = net here with zero losses.
  grossCents: Math.round(netSalesDollars * 100),
  cancelledCents: 0,
  cdCents: 0,
  nsaCents: null,
  workingCents: null,
  holdCents: null,
  issuedCount: null,
  satCount: null,
  soldCount: null,
  ...over,
});

const leadFact = (
  periodStart: string,
  count: number,
  over: Partial<ReportFactRow> = {},
): ReportFactRow => ({
  report_type: "lead_disposition",
  period_start: periodStart,
  period_end: periodStart,
  as_of_date: "2026-08-13",
  market: "ORL_MKT",
  branch_code_raw: null,
  metric: "leads_distinct",
  bucket: null,
  value_cents: null,
  value_count: count,
  scope: "month",
  ...over,
});

// The live Jan–May set. Σ = $41,357,719.15 over 56,196 distinct leads.
const JAN_MAY_NET: [string, number][] = [
  ["2026-01-01", 8_715_862],
  ["2026-02-01", 7_943_980],
  ["2026-03-01", 8_228_073],
  ["2026-04-01", 7_540_900],
  ["2026-05-01", 8_928_904.15],
];
const JAN_MAY_LEADS: [string, number][] = [
  ["2026-01-01", 9_387],
  ["2026-02-01", 11_924],
  ["2026-03-01", 12_805],
  ["2026-04-01", 11_958],
  ["2026-05-01", 10_122],
];
// Not yet eligible on 2026-08-13: June is 69 days old, July 39.
const JUN_JUL_NET: [string, number][] = [
  ["2026-06-01", 8_039_191.13],
  ["2026-07-01", 7_969_737],
];
const JUN_JUL_LEADS: [string, number][] = [
  ["2026-06-01", 9_011],
  ["2026-07-01", 8_722],
];

const ALL_COHORTS = [...JAN_MAY_NET, ...JUN_JUL_NET].map(([m, n]) => cohort(m, n));
const ALL_LEADS = [...JAN_MAY_LEADS, ...JUN_JUL_LEADS].map(([m, c]) => leadFact(m, c));
const AS_OF = "2026-08-13";

describe("netSalesPerRawLead — E2", () => {
  test("the published rate, over the live Jan–May set", () => {
    const r = netSalesPerRawLead(ALL_COHORTS, ALL_LEADS, AS_OF, "REECE");
    expect(r.known).toBe(true);
    if (!r.known) return;

    expect(r.value.netSalesCents).toBe(4_135_771_915);
    expect(r.value.distinctLeads).toBe(56_196);

    // ⚠️ $735.95, NOT the $735.96 printed in Amendment E2/E6. The exact quotient
    // is 41,357,719.15 ÷ 56,196 = 735.954857…, which rounds DOWN. E2's method
    // and inputs are right; the stated cent is a round-up slip. Pinned on the
    // unrounded ratio so this cannot drift a cent at a time.
    expect(r.value.rate).toBeCloseTo(735.954857, 5);
    expect(Number(r.value.rate.toFixed(2))).toBe(735.95);
  });

  test("ELIGIBILITY is start-anchored 90 days — Jan–May in, Jun/Jul out", () => {
    const r = netSalesPerRawLead(ALL_COHORTS, ALL_LEADS, AS_OF, "REECE");
    if (!r.known) throw new Error("expected a measured rate");
    expect(r.value.months).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
    expect(r.value.cohortCount).toBe(5);
    // June is 69 days old on 2026-08-13 and July 39 — a young cohort reads TOO
    // GOOD (losses accrue over time), so including one would understate the lead
    // requirement. That is the flattering direction, which is why it is pinned.
    expect(r.value.months).not.toContain("2026-06-01");
    expect(r.value.months).not.toContain("2026-07-01");
  });

  test("SUM then divide — never the mean of the monthly rates", () => {
    const r = netSalesPerRawLead(ALL_COHORTS, ALL_LEADS, AS_OF, "REECE");
    if (!r.known) throw new Error("expected a measured rate");

    const meanOfMonthly =
      JAN_MAY_NET.reduce((a, [, net], i) => a + net / JAN_MAY_LEADS[i]![1], 0) / 5;
    // $750.01 against $735.95 — averaging weights a light month equally with a
    // heavy one. §11 applies to this ratio exactly as it does to dollars.
    expect(meanOfMonthly).toBeCloseTo(750.0065, 3);
    expect(r.value.rate).not.toBeCloseTo(meanOfMonthly, 1);
  });

  test("a month with dollars but NO lead count is refused, not divided anyway", () => {
    // Dropping May's leads while keeping May's dollars would put five months of
    // numerator over four months of denominator and overstate the rate — which
    // UNDERSTATES the lead requirement. Fails in the flattering direction, so
    // the month must be excluded from both sides.
    const withoutMay = ALL_LEADS.filter((f) => f.period_start !== "2026-05-01");
    const r = netSalesPerRawLead(ALL_COHORTS, withoutMay, AS_OF, "REECE");
    if (!r.known) throw new Error("expected a measured rate");
    expect(r.value.months).not.toContain("2026-05-01");
    expect(r.value.distinctLeads).toBe(56_196 - 10_122);
    expect(r.value.netSalesCents).toBe(4_135_771_915 - 892_890_415);
  });

  test("no eligible cohort → unmeasured with a reason, never a number", () => {
    const r = netSalesPerRawLead(ALL_COHORTS, ALL_LEADS, "2026-01-15", "REECE");
    expect(r.known).toBe(false);
    if (r.known) return;
    expect(r.reason).toMatch(/90 days old/);
  });

  test("no published lead count at all → unmeasured, naming the months", () => {
    const r = netSalesPerRawLead(ALL_COHORTS, [], AS_OF, "REECE");
    expect(r.known).toBe(false);
    if (r.known) return;
    expect(r.reason).toMatch(/no distinct lead count/);
  });
});

describe("distinctLeadsByMonth — scope and grain", () => {
  test("SUMS a market's branch rows (owning-branch fold makes that correct)", () => {
    const rows = [
      leadFact("2026-01-01", 1_700, { market: "ORL_MKT", branch_code_raw: "ORL" }),
      leadFact("2026-01-01", 300, { market: "ORL_MKT", branch_code_raw: "LAKE" }),
    ];
    expect(distinctLeadsByMonth(rows, "ORL_MKT").get("2026-01-01")).toBe(2_000);
  });

  test("IGNORES mtd and ytd snapshots — they answer different windows", () => {
    const rows = [
      leadFact("2026-01-01", 9_387),
      leadFact("2026-01-01", 71_040, { scope: "ytd", period_end: "2026-08-05" }),
      leadFact("2026-01-01", 3_208, { scope: "mtd" }),
    ];
    // Summing all three would triple-count January. Same rule `pickSnapshot`
    // enforces for the panels, applied to a per-month series.
    expect(distinctLeadsByMonth(rows, "ORL_MKT").get("2026-01-01")).toBe(9_387);
  });

  test("IGNORES the row-count metric — the denominator is leads, not rows", () => {
    const rows = [
      leadFact("2026-01-01", 9_387),
      leadFact("2026-01-01", 10_032, { metric: "leads" }),
    ];
    expect(distinctLeadsByMonth(rows, "ORL_MKT").get("2026-01-01")).toBe(9_387);
  });
});

describe("E7 — the actual and the denominator are ONE expression", () => {
  // A single closed month. Deliberately NOT a multi-month window: `coversPeriod`
  // refuses a one-month snapshot as the answer for a wider range (that is the
  // §10 defect it exists to block), so a YTD fixture here would test the period
  // gate rather than the E7 contract.
  const JAN: ResolvedPeriod = {
    key: "month",
    label: "January",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    asOf: "2026-01-31",
    source: "snapshot",
  } as ResolvedPeriod;

  test("buildReportFacts().leads IS the distinct count the rate divides by", () => {
    const rows: ReportFactRow[] = [
      leadFact("2026-01-01", 10_032, { metric: "leads", period_end: "2026-01-31" }),
      leadFact("2026-01-01", 9_387, { period_end: "2026-01-31" }),
    ];
    const actual = buildReportFacts(rows, JAN, "ORL_MKT").leads;
    const denominator = distinctLeadsByMonth(rows, "ORL_MKT").get("2026-01-01");

    // THE E7 CONTRACT. If these ever diverge the pace is wrong by the row/lead
    // ratio (~7%) with nothing on screen to reveal it — which is the entire
    // reason the actual was re-based rather than the target adjusted.
    expect(actual!.leads).toBe(denominator);
    expect(actual!.leads).toBe(9_387);
    // …and the row count is still available beside it, as the secondary figure.
    expect(actual!.leadRows).toBe(10_032);
  });

  test("a duplicated lp_lead_id does NOT inflate the denominator", () => {
    // LP-MCP folds one row per lead before publishing, so a lead appearing under
    // several disposition rows — or under two branches — reaches the dashboard
    // already counted once. The published distinct count is 9,387 against 10,032
    // rows; the rate must divide by the former.
    const rows: ReportFactRow[] = [
      leadFact("2026-01-01", 10_032, { metric: "leads", period_end: "2026-01-31" }),
      leadFact("2026-01-01", 9_387, { period_end: "2026-01-31" }),
    ];
    const r = netSalesPerRawLead([cohort("2026-01-01", 8_715_862)], rows, AS_OF, "ORL_MKT");
    if (!r.known) throw new Error("expected a measured rate");
    expect(r.value.distinctLeads).toBe(9_387);
    expect(r.value.distinctLeads).not.toBe(10_032);
  });
});

describe("assertLeadDistinctAdditive — an EQUALITY, and why", () => {
  test("holds when the branch rows partition the leads", () => {
    const rows = [
      leadFact("2026-01-01", 5_000, { market: "ORL_MKT" }),
      leadFact("2026-01-01", 4_387, { market: "JAX_MKT" }),
    ];
    expect(assertLeadDistinctAdditive(rows, ["ORL_MKT", "JAX_MKT"])).toEqual([]);
  });

  test("FIRES when the sum exceeds company — the fold has broken", () => {
    // ⚠️ If you are here because this failed: DO NOT relax it to `<=`. Amendment
    // E drafted the check that way before accounting for LP-MCP's owning-branch
    // fold, which partitions leads and makes this an exact equality. A `<=`
    // would silently tolerate precisely this regression — a naive per-branch
    // DISTINCT over-counting the 429 leads that appear under two branches.
    const rows = [
      leadFact("2026-01-01", 9_387, { market: "REECE_ONLY_MARKER" }),
      leadFact("2026-01-01", 5_000, { market: "ORL_MKT" }),
      leadFact("2026-01-01", 4_400, { market: "JAX_MKT" }),
    ];
    const v = assertLeadDistinctAdditive(rows, ["ORL_MKT", "JAX_MKT"]);
    expect(v).toHaveLength(1);
    expect(v[0]!.companyDistinct).toBe(18_787); // REECE = Σ every row
    expect(v[0]!.marketSum).toBe(9_400);
  });
});

describe("leadTarget — E3", () => {
  const rate = netSalesPerRawLead(ALL_COHORTS, ALL_LEADS, AS_OF, "REECE");

  test("period goal, target to date and pace", () => {
    // $11.0M ÷ $735.954857 = 14,946.8 leads for the month.
    const t = leadTarget(11_000_000, rate, 13, 26, 5_000);
    if (!t.known) throw new Error("expected a measured target");
    expect(Math.round(t.value.periodGoal)).toBe(14_947);
    // Half the selling days elapsed → half the goal.
    expect(Math.round(t.value.targetToDate)).toBe(7_473);
    expect(Math.round(t.value.paceDelta!)).toBe(5_000 - 7_473);
  });

  test("E3's expected gap is SURFACED, not rescaled", () => {
    // ~15,000 leads/month implied against a run rate near 10,000. The row must
    // report the shortfall rather than quietly shrinking the goal to fit.
    const t = leadTarget(11_000_000, rate, 26, 26, 10_000);
    if (!t.known) throw new Error("expected a measured target");
    expect(t.value.paceDelta).toBeLessThan(-4_000);
    expect(Math.round(t.value.periodGoal)).toBeGreaterThan(14_000);
  });

  test("an unmeasured actual leaves pace null, never 0", () => {
    const t = leadTarget(11_000_000, rate, 13, 26, null);
    if (!t.known) throw new Error("expected a measured target");
    expect(t.value.paceDelta).toBeNull();
  });

  test("no goal → unmeasured with a reason", () => {
    const t = leadTarget(null, rate, 13, 26, 5_000);
    expect(t.known).toBe(false);
    if (t.known) return;
    expect(t.reason).toMatch(/no net sales goal/);
  });

  test("an unmeasured rate propagates its reason, never a fabricated target", () => {
    const noRate = netSalesPerRawLead(ALL_COHORTS, [], AS_OF, "REECE");
    const t = leadTarget(11_000_000, noRate, 13, 26, 5_000);
    expect(t.known).toBe(false);
  });
});

describe("MIN_LEADS_FOR_OWN_RATE — thin markets borrow, never blend", () => {
  test("a thin market falls back to the company rate and is MARKED", () => {
    const companyRate = netSalesPerRawLead(ALL_COHORTS, ALL_LEADS, AS_OF, "REECE");
    const thin = [leadFact("2026-01-01", 50, { market: "LAKE_MKT" })];
    const r = netSalesPerRawLead(
      [cohort("2026-01-01", 8_715_862)],
      thin,
      AS_OF,
      "LAKE_MKT",
      companyRate,
    );
    if (!r.known) throw new Error("expected the company rate");
    // The company's arithmetic, verbatim — a blend of the two would be a third
    // number belonging to nobody.
    expect(r.value.distinctLeads).toBe(56_196);
    expect(r.value.ownRate).toBe(false);
  });

  test("a market clearing the floor keeps its OWN rate", () => {
    const fat = [leadFact("2026-01-01", MIN_LEADS_FOR_OWN_RATE + 1, { market: "ORL_MKT" })];
    const r = netSalesPerRawLead([cohort("2026-01-01", 8_715_862)], fat, AS_OF, "ORL_MKT");
    if (!r.known) throw new Error("expected a measured rate");
    expect(r.value.ownRate).toBe(true);
    expect(r.value.distinctLeads).toBe(MIN_LEADS_FOR_OWN_RATE + 1);
  });
});
