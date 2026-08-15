import { describe, expect, it, test } from "vitest";
import { buildReportFacts, type ReportFactRow } from "./reportFacts.core";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { SCORECARD_MARKETS } from "@/lib/scorecard/markets";

/**
 * §3 + §4 — Leads has ONE authoritative source (report 135, lead_disposition)
 * and resolves per market.
 *
 * TWO DEFECTS THIS GUARDS AGAINST, both live on 2026-08-06:
 *
 *  1. By Market showed 0 leads for EVERY office in MTD, 3-Month and YTD while
 *     the All-Markets row showed a non-zero total. Cause: it read
 *     `raw_leads_in` off lp_market_scorecard_daily, which is NULL for every
 *     market — coerced through numOr0() a missing figure became a confident 0.
 *
 *  2. lp_report_facts is stored at BRANCH grain with `market` as a rollup
 *     label. Fort Lauderdale carries FIVE lead_disposition rows. Anything that
 *     doesn't sum them reports one branch's number, or nothing.
 */

const YTD: ResolvedPeriod = {
  key: "ytd",
  label: "Year to date",
  periodStart: "2026-01-01",
  periodEnd: "2026-08-05",
  asOf: "2026-08-05",
  isPartial: false,
  source: "aggregate",
};

const base = {
  period_start: "2026-01-01",
  period_end: "2026-08-05",
  as_of_date: "2026-08-05",
  bucket: null,
  value_cents: null,
  scope: "ytd" as const,
};

/** Report 135 ROW count — the secondary figure since E7 (`LeadsFacts.leadRows`). */
const ld = (market: string, branch: string | null, count: number): ReportFactRow => ({
  ...base, report_type: "lead_disposition", market, branch_code_raw: branch,
  metric: "leads", value_count: count,
});

/** Report 135 DISTINCT count — the PUBLISHED actual since E7 (`LeadsFacts.leads`). */
const ldd = (market: string, branch: string | null, count: number): ReportFactRow => ({
  ...base, report_type: "lead_disposition", market, branch_code_raw: branch,
  metric: "leads_distinct", value_count: count,
});

/**
 * The real live YTD rows, at their real branch grain.
 *
 * Both grains, because both ship: Σ rows = 78,557 and Σ distinct = 71,040. Every
 * figure below is the warehouse's, read from `lp_report_facts` for the current
 * YTD snapshot — not scaled or invented, so a branch that moves here is a branch
 * that moved in LP.
 *
 * The distinct rows are what make the §4 summation test meaningful after E7:
 * they are emitted at the SAME branch grain, one row per lead assigned to that
 * lead's owning branch, so they must sum exactly the way the row counts do.
 */
const LIVE: ReportFactRow[] = [
  ld("STPET_MKT", "STPET", 17_405), ld("STPET_MKT", null, 89),
  ld("ORL_MKT", "ORL", 16_527), ld("ORL_MKT", null, 28),
  ld("FTMYR_MKT", "FTMYR", 11_623), ld("FTMYR_MKT", null, 43),
  ld("JAX_MKT", "JAX", 9_140), ld("JAX_MKT", null, 19),
  ld("SAR_MKT", "SAR", 6_418), ld("SAR_MKT", null, 30),
  ld("LAKE_MKT", "LAKE", 2_899), ld("LAKE_MKT", null, 28),
  // Fort Lauderdale's five real branch rows — the grain trap.
  ld("FTLAU_MKT", "FTLAU", 3_181), ld("FTLAU_MKT", "BOCA", 5_427),
  ld("FTLAU_MKT", "MIAMI", 1_608), ld("FTLAU_MKT", "RFED", 286),
  ld("FTLAU_MKT", null, 29),
  ld("UNASSIGNED", null, 2_693), ld("OUT_OF_AREA", null, 1_082),
  ld("OUT_OF_AREA", "0", 2),

  ldd("STPET_MKT", "STPET", 15_710), ldd("STPET_MKT", null, 83),
  ldd("ORL_MKT", "ORL", 14_903), ldd("ORL_MKT", null, 28),
  ldd("FTMYR_MKT", "FTMYR", 10_332), ldd("FTMYR_MKT", null, 40),
  ldd("JAX_MKT", "JAX", 8_268), ldd("JAX_MKT", null, 19),
  ldd("SAR_MKT", "SAR", 5_743), ldd("SAR_MKT", null, 29),
  ldd("LAKE_MKT", "LAKE", 2_603), ldd("LAKE_MKT", null, 18),
  ldd("FTLAU_MKT", "FTLAU", 2_966), ldd("FTLAU_MKT", "BOCA", 5_015),
  ldd("FTLAU_MKT", "MIAMI", 1_476), ldd("FTLAU_MKT", "RFED", 285),
  ldd("FTLAU_MKT", null, 28),
  ldd("UNASSIGNED", null, 2_490), ldd("OUT_OF_AREA", null, 1_002),
  ldd("OUT_OF_AREA", "0", 2),

  // Report 136's company control total — reconciliation ONLY, never a read path.
  // Stays on the ROW basis: 136 publishes no distinct count.
  { ...base, report_type: "source_cost", market: "REECE", branch_code_raw: null,
    metric: "leads", value_count: 78_561 },
];

describe("§4 — Leads resolve per market and sum to the company total", () => {
  test("every office resolves a non-zero lead count", () => {
    for (const m of SCORECARD_MARKETS) {
      const { leads } = buildReportFacts(LIVE, YTD, m.code);
      expect(leads, `${m.label} has no leads facts`).not.toBeNull();
      expect(leads!.leads, `${m.label} rendered 0 leads`).toBeGreaterThan(0);
    }
  });

  test("Fort Lauderdale sums all FIVE branch rows, not one of them", () => {
    const { leads } = buildReportFacts(LIVE, YTD, "FTLAU_MKT");
    // E7: the published actual is DISTINCT. Both grains must sum across all
    // five branches — the trap is the summation, not the metric.
    expect(leads!.leads).toBe(2_966 + 5_015 + 1_476 + 285 + 28); // 9,770
    expect(leads!.leadRows).toBe(3_181 + 5_427 + 1_608 + 286 + 29); // 10,531
    // The grain trap: any single branch would have been a plausible-looking
    // number. 5,015 (BOCA) is the largest and the likeliest wrong answer.
    expect(leads!.leads).not.toBe(5_015);
  });

  test("company leads read 71,040 distinct over 78,557 rows", () => {
    const { leads } = buildReportFacts(LIVE, YTD, "REECE");
    expect(leads!.leads).toBe(71_040);
    expect(leads!.leadRows).toBe(78_557);
    // ⚠️ E7: publishing the ROW count here overstated leads by 7,517 — 10.6% —
    // and would put the Leads actual in a different unit from the target's
    // denominator, making the pace wrong with nothing on screen to reveal it.
    expect(leads!.leads).not.toBe(leads!.leadRows);
    // The originally displayed figure was 15,164 — off by a factor of five and
    // close to the Issued total (15,441). Nothing in that range can be leads.
    expect(leads!.leads).toBeGreaterThan(70_000);
  });

  test("per-office totals sum to the company figure exactly, at BOTH grains", () => {
    // This is E7's additivity contract at the read layer: it holds only because
    // LP-MCP assigns each lead to the branch of its lowest row_num. It is an
    // EQUALITY — do not relax it to `<=` if it ever fires. See
    // `assertLeadDistinctAdditive`.
    const company = buildReportFacts(LIVE, YTD, "REECE").leads!;
    const sumOf = (pick: (f: NonNullable<ReturnType<typeof buildReportFacts>["leads"]>) => number | null) => {
      const offices = SCORECARD_MARKETS.reduce((a, m) => {
        const f = buildReportFacts(LIVE, YTD, m.code).leads;
        return a + (f ? pick(f) ?? 0 : 0);
      }, 0);
      // ONE utility read, not two. UNASSIGNED is a single display entity whose
      // sources are ["UNASSIGNED", "OUT_OF_AREA"] (§7 cardinality ruling), so
      // asking for OUT_OF_AREA as well returns the same rows a second time and
      // over-counts the company by the utility total.
      const f = buildReportFacts(LIVE, YTD, "UNASSIGNED").leads;
      return offices + (f ? pick(f) ?? 0 : 0);
    };
    expect(sumOf((f) => f.leads)).toBe(company.leads);
    expect(sumOf((f) => f.leadRows)).toBe(company.leadRows);
  });

  test("Lakeland carries its own leads, and Orlando's exclude them", () => {
    const orl = buildReportFacts(LIVE, YTD, "ORL_MKT").leads!.leads;
    const lake = buildReportFacts(LIVE, YTD, "LAKE_MKT").leads!.leads;
    expect(orl).toBe(14_903 + 28);
    expect(lake).toBe(2_603 + 18);
    expect(orl).not.toBe(14_903 + 28 + 2_603 + 18); // the old fold
  });
});

describe("§3 — one authoritative source per metric", () => {
  test("leads come from 135; 136 rides along as a reconciliation only", () => {
    const { leads } = buildReportFacts(LIVE, YTD, "REECE");
    expect(leads!.basis).toBe("lead_disposition");
    expect(leads!.leads).toBe(71_040); // 135, distinct — the published actual
    expect(leads!.leadRows).toBe(78_557); // 135, rows — the secondary figure
    expect(leads!.reconLeads).toBe(78_561); // 136, displayed but never read from
    // The 135↔136 gate compares ROW to ROW: 136 has no distinct count, so
    // re-basing this half would compare two different things and turn a
    // 4-row tolerance into a 7,521 "failure".
    expect(leads!.reconDelta).toBe(78_557 - 78_561);
  });

  test("the 135↔136 delta stays within report 135's validation gate of 4", () => {
    // Report 135 has NO footer total row, so its gate is a row-count tie
    // against 136 for the same period. This is a WEAKER guarantee than the
    // other four reports have, and is documented as such.
    const { leads } = buildReportFacts(LIVE, YTD, "REECE");
    expect(Math.abs(leads!.reconDelta!)).toBeLessThanOrEqual(4);
  });

  test("a market never gets a reconciliation figure — that is company-only", () => {
    const { leads } = buildReportFacts(LIVE, YTD, "SAR_MKT");
    expect(leads!.reconLeads).toBeNull();
    expect(leads!.reconDelta).toBeNull();
  });

  test("dropping 135 yields null, never a fallback to 136 and never 0", () => {
    const without = LIVE.filter((r) => r.report_type !== "lead_disposition");
    const { leads } = buildReportFacts(without, YTD, "REECE");
    // Fail closed: no second read path exists, so the figure is unknown — which
    // renders "—". A 0 here would read as "no leads came in", which is false.
    expect(leads).toBeNull();
  });

  test("a YTD snapshot never answers an MTD view", () => {
    const MTD: ResolvedPeriod = {
      key: "month", label: "August (MTD)", periodStart: "2026-08-01",
      periodEnd: "2026-08-05", asOf: "2026-08-05", isPartial: false, source: "snapshot",
    };
    expect(buildReportFacts(LIVE, MTD, "REECE").leads).toBeNull();
  });
});

// ── §J5 — released revenue names its own source ────────────────────────────
//
// The "Released this period" panel carried the subtitle "Basis: RTP milestone
// date · report 134" while `viewModel.ts` read `released_dollars` from
// `lp_market_scorecard_daily` — a table fed by the LP API sync, not by the
// reports. On 2026-08-10 that sync had been stuck for four days and the panel
// showed $702,506 against report 134's own $2,052,603 across 86 jobs.
//
// A tile may fall back. It may not borrow a provenance it is not reading.

describe("§J5 — released revenue comes from report 134, and says when it does not", () => {
  const RESOLVED = YTD;

  function milestoneRow(over: Partial<ReportFactRow> = {}): ReportFactRow {
    return {
      report_type: "jobs_by_milestone",
      market: "STPET_MKT",
      metric: "net_sales",
      scope: "ytd",
      period_start: RESOLVED.periodStart,
      period_end: RESOLVED.periodEnd,
      as_of_date: "2026-08-10",
      value_count: 86,
      value_cents: 205_260_300,
      bucket: null,
      ...over,
    } as ReportFactRow;
  }

  it("reads net released from jobs_by_milestone, not from the daily table", () => {
    const { released } = buildReportFacts([milestoneRow()], RESOLVED, "STPET_MKT");
    expect(released).not.toBeNull();
    expect(released!.basis).toBe("jobs_by_milestone");
    expect(released!.netReleasedDollars).toBeCloseTo(2_052_603, 2);
    expect(released!.jobCount).toBe(86);
    expect(released!.asOf).toBe("2026-08-10");
  });

  it("returns null — never 0 — when no 134 snapshot covers the period", () => {
    // Null is what lets the panel say "FALLBACK: live sync table". A 0 would
    // render as a confident "$0 released", which is the failure this replaces.
    const { released } = buildReportFacts([], RESOLVED, "STPET_MKT");
    expect(released).toBeNull();
  });

  it("does not answer an MTD view from a YTD snapshot", () => {
    // Same period gate buildSold uses — a flow figure must match its window.
    // "month" is the PeriodKey for a month-to-date view; "mtd" is a FactScope,
    // a different union — they are easy to confuse and the compiler catches it.
    const monthView: ResolvedPeriod = {
      ...RESOLVED,
      key: "month",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-10",
    };
    const { released } = buildReportFacts([milestoneRow()], monthView, "STPET_MKT");
    expect(released).toBeNull();
  });

  it("a market with no 134 rows does not inherit another market's release", () => {
    const { released } = buildReportFacts([milestoneRow({ market: "ORL_MKT" })], RESOLVED, "STPET_MKT");
    expect(released).toBeNull();
  });
});

// ── §K — report 133's terminal cohort is readable, and stays out of "open" ──

describe("§K — the lost bucket is sourced, and never counted as open pipeline", () => {
  const js = (bucket: string, count: number, cents: number): ReportFactRow =>
    ({
      report_type: "job_status_ytd",
      market: "STPET_MKT",
      metric: bucket === "lost" || bucket === "completed" ? `cohort_${bucket}` : "good_business_open",
      scope: "mtd",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      as_of_date: "2026-08-10",
      value_count: count,
      value_cents: cents,
      bucket,
    }) as ReportFactRow;

  it("surfaces lost and completed from the 133 cohort", () => {
    const { goodBusiness } = buildReportFacts(
      [js("hoa", 5, 100_000), js("lost", 167, 401_233_800), js("completed", 331, 988_411_200)],
      YTD,
      "STPET_MKT",
    );
    expect(goodBusiness!.lost.count).toBe(167);
    expect(goodBusiness!.completed.count).toBe(331);
  });

  it("REGRESSION: terminal buckets are excluded from pending and open totals", () => {
    // Report 133 became a contract-date cohort on 2026-08-07 — it now carries
    // mostly TERMINAL jobs. Folding those into "open pipeline" would report
    // hundreds of finished and cancelled jobs as backlog.
    const { goodBusiness } = buildReportFacts(
      [js("hoa", 5, 100_000), js("lost", 167, 401_233_800), js("completed", 331, 988_411_200)],
      YTD,
      "STPET_MKT",
    );
    expect(goodBusiness!.pendingTotalCount).toBe(5);
    expect(goodBusiness!.openJobsTotal).toBe(5); // hoa only; no in_production row here
  });
});

// ── §K — cancellations come from report 133, split by cause ────────────────
//
// The tile read "not yet sourced" because `lp_market_scorecard_daily` has no
// cancellation column — only `ko_count`, a different measure on a different
// cohort (12 for August against 14 lost jobs in the same window). No amount of
// backfill fixes that; it is a wiring change.
//
// The `lost` bucket is 976 jobs and was one undifferentiated number covering
// four different management conversations. Credit Decline alone is 340 of them.

describe("§K — loss cause is a status grouping within lost", () => {
  const lostRow = (bucket: string, count: number, cents: number, over: Partial<ReportFactRow> = {}): ReportFactRow =>
    ({
      report_type: "job_status_ytd",
      market: "STPET_MKT",
      metric: "cohort_lost_by_status",
      scope: "ytd",
      period_start: YTD.periodStart,
      period_end: YTD.periodEnd,
      as_of_date: "2026-08-11",
      value_count: count,
      value_cents: cents,
      bucket,
      ...over,
    }) as ReportFactRow;

  const COMPANY = [
    lostRow("cancelled", 520, 1_264_707_000),
    lostRow("credit_decline", 340, 759_908_900),
    lostRow("dead_deal", 93, 220_495_000),
    lostRow("cancelled_by_mgt", 23, 58_618_600),
  ];

  it("splits the lost cohort into its four causes and foots to the total", () => {
    const { lost } = buildReportFacts(COMPANY, YTD, "STPET_MKT");
    expect(lost).not.toBeNull();
    expect(lost!.basis).toBe("job_status_ytd");
    expect(lost!.totalCount).toBe(976);
    expect(lost!.byCause.map((c) => c.key)).toEqual([
      "cancelled", "credit_decline", "dead_deal", "cancelled_by_mgt",
    ]);
    // Ordered most-severe first, and the split MUST equal the total.
    expect(lost!.byCause.reduce((a, c) => a + c.count, 0)).toBe(lost!.totalCount);
  });

  it("credit decline is separable — it is 35% of losses and was invisible", () => {
    const { lost } = buildReportFacts(COMPANY, YTD, "STPET_MKT");
    const cd = lost!.byCause.find((c) => c.key === "credit_decline")!;
    expect(cd.count).toBe(340);
    expect(cd.dollars).toBeCloseTo(7_599_089, 2);
  });

  it("omits causes nobody had rather than rendering a row of zeros", () => {
    const { lost } = buildReportFacts([lostRow("cancelled", 5, 100_000)], YTD, "STPET_MKT");
    expect(lost!.byCause).toHaveLength(1);
    expect(lost!.byCause[0]!.key).toBe("cancelled");
  });

  it("returns null — never 0 — when no 133 snapshot covers the period", () => {
    // Null is what lets the panel say "not yet sourced". A 0 would read as
    // "nothing was lost", which is a very different claim.
    expect(buildReportFacts([], YTD, "STPET_MKT").lost).toBeNull();
  });

  it("does not answer an MTD view from a YTD snapshot", () => {
    // A loss belongs to the period its job was contracted in — flow semantics,
    // unlike the open-pipeline buckets.
    const monthView: ResolvedPeriod = {
      ...YTD, key: "month", periodStart: "2026-08-01", periodEnd: "2026-08-31", asOf: "2026-08-11",
    };
    expect(buildReportFacts(COMPANY, monthView, "STPET_MKT").lost).toBeNull();
  });

  it("surfaces UNRESOLVED so per-market counts visibly fail to foot", () => {
    // The 8th market: null branch codes seen in February, April and June. An
    // unexplained gap in a coaching meeting is worse than an "unassigned" line.
    const withUnresolved = [
      ...COMPANY,
      lostRow("cancelled", 2, 3_000_000, { market: "UNRESOLVED" }),
      lostRow("credit_decline", 1, 1_362_600, { market: "UNRESOLVED" }),
    ];
    const { lost } = buildReportFacts(withUnresolved, YTD, "REECE");
    expect(lost!.unresolvedCount).toBe(3);
    expect(lost!.unresolvedDollars).toBeCloseTo(43_626, 2);
    // Still inside the company total — it is unattributed, not excluded.
    expect(lost!.totalCount).toBe(979);
  });

  it("a single market does not inherit another market's losses", () => {
    const { lost } = buildReportFacts(
      [lostRow("cancelled", 100, 100_000, { market: "ORL_MKT" })],
      YTD,
      "STPET_MKT",
    );
    expect(lost).toBeNull();
  });
});
