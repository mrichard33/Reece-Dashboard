import { describe, expect, test } from "vitest";
import { buildReportFacts, coversPeriod, type ReportFactRow } from "./reportFacts.core";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * Guards for the lp_report_facts projection — Sold This Period and Net (Good
 * Business) figures for the ③ cards.
 *
 * The regression that motivated this module (2026-08-05): cancellation value
 * was computed as the gross−net residual, so a zero net_sales rendered
 * cancellations equal to gross sold and surviving business $0. Here the
 * cancel value must equal GSA − NSA exactly and NEVER equal gross when NSA
 * is present; missing sources must yield null (→ "—"), never 0.
 */

const YTD: ResolvedPeriod = {
  key: "ytd",
  label: "Year to date",
  periodStart: "2026-01-01",
  periodEnd: "2026-08-05",
  asOf: "2026-08-05",
  isPartial: true,
  source: "aggregate",
} as ResolvedPeriod;

const MTD: ResolvedPeriod = {
  ...YTD,
  key: "month",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  source: "snapshot",
} as ResolvedPeriod;

const base = {
  period_start: "2026-01-01",
  period_end: "2026-08-05",
  as_of_date: "2026-08-05",
  branch_code_raw: null,
  bucket: null,
} as const;

const sc = (metric: string, value_cents: number | null, value_count: number): ReportFactRow => ({
  ...base, report_type: "source_cost", market: "REECE", metric, value_cents, value_count,
});
const ld = (market: string, metric: string, value_cents: number | null, value_count: number): ReportFactRow => ({
  ...base, report_type: "lead_disposition", market, metric, value_cents, value_count,
});
const js = (market: string, bucket: string, value_cents: number, value_count: number): ReportFactRow => ({
  ...base,
  report_type: "job_status_ytd",
  market,
  metric: bucket === "in_production" ? "pipeline_excluded" : "good_business_open",
  bucket,
  value_cents,
  value_count,
});

// The live 2026-08-05 control totals, in cents.
const SOURCE_COST: ReportFactRow[] = [
  sc("sold", null, 3344),
  sc("net_sold", null, 2389),
  sc("gross_sold", 7_990_466_720, 127),
  sc("net_sales", 5_689_378_743, 127),
];

describe("Sold This Period (company = control totals)", () => {
  test("five-line structure ties the §0 control totals", () => {
    const { sold } = buildReportFacts(SOURCE_COST, YTD, "REECE");
    expect(sold).not.toBeNull();
    expect(sold!.basis).toBe("control_totals");
    expect(sold!.soldCount).toBe(3344);
    expect(sold!.grossSoldDollars).toBeCloseTo(79_904_667.2, 2);
    expect(sold!.cancelCount).toBe(3344 - 2389);
    expect(sold!.cancelValueDollars).toBeCloseTo(23_010_879.77, 2);
    expect(sold!.netAfterCancelsDollars).toBeCloseTo(56_893_787.43, 2);
  });

  test("REGRESSION: cancellation value = GSA − NSA, never the gross figure", () => {
    const { sold } = buildReportFacts(SOURCE_COST, YTD, "REECE");
    expect(sold!.cancelValueDollars).not.toBe(sold!.grossSoldDollars);
    expect(sold!.cancelValueDollars).toBeCloseTo(
      sold!.grossSoldDollars - sold!.netAfterCancelsDollars!, 6);
    // and surviving business does NOT collapse to zero
    expect(sold!.netAfterCancelsDollars!).toBeGreaterThan(0);
  });

  test("period gate: a YTD snapshot never answers an MTD view → null → '—'", () => {
    const { sold } = buildReportFacts(SOURCE_COST, MTD, "REECE");
    expect(sold).toBeNull();
  });

  test("no facts at all → null, never zeros", () => {
    const { sold, goodBusiness } = buildReportFacts([], YTD, "REECE");
    expect(sold).toBeNull();
    expect(goodBusiness).toBeNull();
  });
});

describe("Sold This Period (market = lead-attributed basis)", () => {
  const rows = [
    ld("ORL_MKT", "sold", 1_000_00, 2),
    ld("ORL_MKT", "net_sold", 700_00, 1),
    ld("LAKE_MKT", "sold", 500_00, 1),
    ld("LAKE_MKT", "net_sold", 500_00, 1),
    ld("SAR_MKT", "sold", 999_00, 9),
  ];
  // LAKELAND RULING (2026-08-06): Orlando no longer absorbs LAKE_MKT.
  test("Orlando reads ORL only and labels the basis", () => {
    const { sold } = buildReportFacts(rows, YTD, "ORL_MKT");
    expect(sold!.basis).toBe("lead_attributed");
    expect(sold!.soldCount).toBe(2);
    expect(sold!.grossSoldDollars).toBe(1000);
    expect(sold!.cancelCount).toBe(1);
    expect(sold!.cancelValueDollars).toBe(300);
    expect(sold!.netAfterCancelsDollars).toBe(700);
  });
  test("Lakeland reads its own rows, never Orlando's", () => {
    const { sold } = buildReportFacts(rows, YTD, "LAKE_MKT");
    expect(sold!.soldCount).toBe(1);
    expect(sold!.grossSoldDollars).toBe(500);
    expect(sold!.cancelCount).toBe(0);
    expect(sold!.netAfterCancelsDollars).toBe(500);
  });
  test("other markets' rows never leak in", () => {
    const { sold } = buildReportFacts(rows, YTD, "SAR_MKT");
    expect(sold!.soldCount).toBe(9);
  });
});

describe("Net (Good Business) pending buckets", () => {
  const rows = [
    js("ORL_MKT", "hoa", 100_000_00, 3),
    js("ORL_MKT", "permit", 50_000_00, 1),
    js("SAR_MKT", "other_pending", 25_000_00, 2),
    js("SAR_MKT", "in_production", 900_000_00, 10),
    js("UNASSIGNED", "in_production", 34_400_00, 2),
  ];
  test("buckets carry count + dollars and foot to all open jobs (company)", () => {
    const { goodBusiness: gb } = buildReportFacts(rows, YTD, "REECE");
    expect(gb!.hoa).toEqual({ count: 3, dollars: 100_000 });
    expect(gb!.permit).toEqual({ count: 1, dollars: 50_000 });
    expect(gb!.otherPending).toEqual({ count: 2, dollars: 25_000 });
    expect(gb!.pendingTotalDollars).toBe(175_000);
    expect(gb!.pendingTotalCount).toBe(6);
    // footing: hoa + permit + other + excluded == every open job, UNASSIGNED included
    expect(gb!.openJobsTotal).toBe(18);
  });
  test("stock semantics: buckets answer an MTD view too (with their own as-of)", () => {
    const { goodBusiness: gb } = buildReportFacts(rows, MTD, "REECE");
    expect(gb).not.toBeNull();
    expect(gb!.asOf).toBe("2026-08-05");
  });
  test("market filter applies; missing market → null, never a zero bucket", () => {
    const { goodBusiness: gb } = buildReportFacts(rows, YTD, "ORL_MKT");
    expect(gb!.pendingTotalCount).toBe(4);
    const { goodBusiness: none } = buildReportFacts(rows, YTD, "JAX_MKT");
    expect(none).toBeNull();
  });
});

/**
 * REGRESSION — the open backlog was summed across OVERLAPPING snapshots.
 *
 * Report 133 is a contract-date cohort and keeps several snapshots current at
 * once: a YTD roll-up, a month tile per elapsed month, and an MTD file. Every
 * job appears in the roll-up AND in its month's tile, so summing every current
 * row double-counted the year. Live on 2026-08-15 that showed company backlog
 * as $12,312,052 against a real $6,165,115, and Jacksonville's HOA line as 11
 * jobs / $206,064 when six were open.
 *
 * The fixture is Jacksonville's actual rows that day.
 */
describe("REGRESSION: open backlog must not sum overlapping snapshots", () => {
  const at = (
    period_start: string,
    period_end: string,
    as_of_date: string,
    market: string,
    bucket: string,
    value_cents: number,
    value_count: number,
  ): ReportFactRow => ({
    ...base,
    period_start,
    period_end,
    as_of_date,
    report_type: "job_status_ytd",
    market,
    metric: bucket === "in_production" ? "pipeline_excluded" : "good_business_open",
    bucket,
    value_cents,
    value_count,
  });

  const MONTH_WINDOWS: [string, string][] = [
    ["2026-01-01", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-31"],
    ["2026-04-01", "2026-04-30"],
    ["2026-05-01", "2026-05-31"],
    ["2026-06-01", "2026-06-30"],
    ["2026-07-01", "2026-07-31"],
  ];

  const JAX = [
    // YTD roll-up — restates every tile below it.
    at("2026-01-01", "2026-08-05", "2026-08-05", "JAX_MKT", "hoa", 84_632_00, 5),
    at("2026-01-01", "2026-08-05", "2026-08-05", "JAX_MKT", "permit", 47_210_00, 1),
    at("2026-01-01", "2026-08-05", "2026-08-05", "JAX_MKT", "other_pending", 187_243_00, 7),
    // Month tiles, as-of 08-10.
    ...MONTH_WINDOWS.map(([s, e]) => at(s, e, "2026-08-10", "JAX_MKT", "in_production", 0, 0)),
    at("2026-05-01", "2026-05-31", "2026-08-10", "JAX_MKT", "permit", 7_500_00, 1),
    at("2026-06-01", "2026-06-30", "2026-08-10", "JAX_MKT", "other_pending", 20_000_00, 1),
    at("2026-07-01", "2026-07-31", "2026-08-10", "JAX_MKT", "hoa", 84_632_00, 5),
    at("2026-07-01", "2026-07-31", "2026-08-10", "JAX_MKT", "other_pending", 147_459_00, 8),
    // MTD file, as-of 08-15.
    at("2026-08-01", "2026-08-14", "2026-08-15", "JAX_MKT", "hoa", 36_800_00, 1),
    at("2026-08-01", "2026-08-14", "2026-08-15", "JAX_MKT", "other_pending", 70_558_00, 5),
  ];

  test("Jacksonville backlog is the tiling, not tiling + roll-up", () => {
    const { goodBusiness: gb } = buildReportFacts(JAX, MTD, "JAX_MKT");
    expect(gb!.hoa).toEqual({ count: 6, dollars: 121_432 });
    expect(gb!.permit).toEqual({ count: 1, dollars: 7_500 });
    expect(gb!.otherPending).toEqual({ count: 14, dollars: 238_017 });
    expect(gb!.pendingTotalCount).toBe(21);
    expect(gb!.pendingTotalDollars).toBe(366_949);
  });

  test("the figures it replaces — 34 jobs / $686,034 — are gone", () => {
    const { goodBusiness: gb } = buildReportFacts(JAX, MTD, "JAX_MKT");
    expect(gb!.pendingTotalCount).not.toBe(34);
    expect(gb!.pendingTotalDollars).not.toBe(686_034);
  });

  test("as-of is the STALEST tile, not the freshest — the answer is only that current", () => {
    const { goodBusiness: gb } = buildReportFacts(JAX, MTD, "JAX_MKT");
    expect(gb!.asOf).toBe("2026-08-10");
  });

  test("offices still foot to the company", () => {
    const orl = JAX.map((r) => ({ ...r, market: "ORL_MKT" }));
    const both = [...JAX, ...orl];
    const co = buildReportFacts(both, MTD, "REECE").goodBusiness!;
    const a = buildReportFacts(both, MTD, "JAX_MKT").goodBusiness!;
    const b = buildReportFacts(both, MTD, "ORL_MKT").goodBusiness!;
    expect(co.pendingTotalCount).toBe(a.pendingTotalCount + b.pendingTotalCount);
    expect(co.pendingTotalDollars).toBe(a.pendingTotalDollars + b.pendingTotalDollars);
  });

  test("a market present in only one tile is still summed over the whole cover", () => {
    // FTMYR appears only in the MTD file. Choosing the cover per market would
    // hand it a different window set than JAX and break the footing above.
    const rows = [...JAX, at("2026-08-01", "2026-08-14", "2026-08-15", "FTMYR_MKT", "hoa", 10_000_00, 1)];
    const gb = buildReportFacts(rows, MTD, "FTMYR_MKT").goodBusiness!;
    expect(gb.hoa).toEqual({ count: 1, dollars: 10_000 });
  });
});

describe("Sold This Period (report 137 authoritative — sales_efficiency)", () => {
  const se = (market: string, branch: string, metric: string, value_cents: number | null, value_count: number): ReportFactRow => ({
    ...base, report_type: "sales_efficiency", market, branch_code_raw: branch, metric, value_cents, value_count,
  });
  // Live 2026-08-05 YTD figures for Sarasota, Orlando and Lakeland.
  const ROWS: ReportFactRow[] = [
    se("SAR_MKT", "SAR", "sold", 1_280_148_600, 485),
    se("SAR_MKT", "SAR", "net_sold", 929_889_600, 338),
    se("SAR_MKT", "SAR", "cancelled", 199_395_700, 73),
    se("ORL_MKT", "ORL", "sold", 1_344_355_800, 682),
    se("ORL_MKT", "ORL", "net_sold", 826_183_900, 408),
    se("ORL_MKT", "ORL", "cancelled", 307_507_600, 150),
    se("LAKE_MKT", "LAKE", "sold", 200_389_000, 107),
    se("LAKE_MKT", "LAKE", "net_sold", 107_207_700, 60),
    se("LAKE_MKT", "LAKE", "cancelled", 57_069_000, 29),
  ];

  test("§8.11 per-market sold populates from 137 with EXPLICIT cancellations", () => {
    const { sold } = buildReportFacts(ROWS, YTD, "SAR_MKT");
    expect(sold!.basis).toBe("sales_efficiency");
    expect(sold!.soldCount).toBe(485);
    expect(sold!.grossSoldDollars).toBeCloseTo(12_801_486, 2);
    expect(sold!.cancelCount).toBe(73);
    expect(sold!.cancelValueDollars).toBeCloseTo(1_993_957, 2);
    expect(sold!.netAfterCancelsDollars).toBeCloseTo(9_298_896, 2);
    // cancellations are the report's own bucket — NOT sold − net_sold
    expect(sold!.cancelCount).not.toBe(485 - 338);
  });

  // LAKELAND RULING (2026-08-06): Orlando and Lakeland are separate markets.
  test("§8.11 Orlando reads ORL only — Lakeland is not folded in", () => {
    const { sold } = buildReportFacts(ROWS, YTD, "ORL_MKT");
    expect(sold!.soldCount).toBe(682);
    expect(sold!.cancelCount).toBe(150);
    expect(sold!.cancelValueDollars).toBeCloseTo(3_075_076, 2);
    expect(sold!.netAfterCancelsDollars).toBeCloseTo(8_261_839, 2);
  });

  test("§8.11 Lakeland stands alone with its own 137 figures", () => {
    const { sold } = buildReportFacts(ROWS, YTD, "LAKE_MKT");
    expect(sold!.basis).toBe("sales_efficiency");
    expect(sold!.soldCount).toBe(107);
    expect(sold!.grossSoldDollars).toBeCloseTo(2_003_890, 2);
    expect(sold!.cancelCount).toBe(29);
    expect(sold!.cancelValueDollars).toBeCloseTo(570_690, 2);
    expect(sold!.netAfterCancelsDollars).toBeCloseTo(1_072_077, 2);
  });

  test("§8.12 cancellation value ≠ gross sold (the confirmed defect)", () => {
    const { sold } = buildReportFacts(ROWS, YTD, "SAR_MKT");
    expect(sold!.cancelValueDollars).not.toBe(sold!.grossSoldDollars);
    expect(sold!.netAfterCancelsDollars!).toBeGreaterThan(0);
  });

  test("137 beats the older bases when both cover the period; falls back when 137 absent", () => {
    const withSc = [...ROWS, ...SOURCE_COST];
    const company = buildReportFacts(withSc, YTD, "REECE");
    expect(company.sold!.basis).toBe("sales_efficiency");
    const fallback = buildReportFacts(SOURCE_COST, YTD, "REECE");
    expect(fallback.sold!.basis).toBe("control_totals");
  });

  test("counts_only 137 rows source the flow metrics and leave net unsourced", () => {
    // An MTD pull prints a blank Net column: counts and cancellations are real,
    // net is not yet knowable. It must NOT fall through to another basis (that
    // would answer with a different window) and must NOT show $0.
    const countsOnly = ROWS.filter((r) => r.metric !== "net_sold");
    const { sold } = buildReportFacts(countsOnly, YTD, "SAR_MKT");
    expect(sold!.basis).toBe("sales_efficiency");
    expect(sold!.soldCount).toBe(485);
    expect(sold!.grossSoldDollars).toBeCloseTo(12_801_486, 2);
    expect(sold!.cancelCount).toBe(73);
    expect(sold!.netAfterCancelsDollars).toBeNull();
    expect(sold!.netPendingReason).toMatch(/maturing/);
  });
});

// ── §1 SCOPE: two current snapshots of one report type coexist ──────────────
describe("scope selection (2026-08-05 §1 regression)", () => {
  const se = (
    scope: "ytd" | "mtd",
    period: [string, string],
    asOf: string,
    metric: string,
    cents: number | null,
    count: number,
  ): ReportFactRow => ({
    ...base,
    report_type: "sales_efficiency",
    market: "SAR_MKT",
    branch_code_raw: "SAR",
    period_start: period[0],
    period_end: period[1],
    as_of_date: asOf,
    scope,
    metric,
    value_cents: cents,
    value_count: count,
  });

  // What was live on 2026-08-05: a YTD CSV (Jan 1 → Sep 2, full Net) and an MTD
  // PDF (Aug 1–31, counts only) — both is_current under the scope model.
  const YTD_ROWS = [
    se("ytd", ["2026-01-01", "2026-09-02"], "2026-08-05", "sold", 1_280_148_600, 485),
    se("ytd", ["2026-01-01", "2026-09-02"], "2026-08-05", "net_sold", 929_889_600, 338),
    se("ytd", ["2026-01-01", "2026-09-02"], "2026-08-05", "cancelled", 199_395_700, 73),
  ];
  const MTD_ROWS = [
    se("mtd", ["2026-08-01", "2026-08-31"], "2026-08-05", "sold", 70_291_600, 30),
    se("mtd", ["2026-08-01", "2026-08-31"], "2026-08-05", "cancelled", 12_414_100, 2),
  ];
  const AUG: ResolvedPeriod = {
    ...YTD, key: "month", periodStart: "2026-08-01", periodEnd: "2026-08-31", source: "snapshot",
  } as ResolvedPeriod;

  test("the YTD view answers from the YTD snapshot, MTD rows present or not", () => {
    const only = buildReportFacts(YTD_ROWS, YTD, "SAR_MKT");
    const both = buildReportFacts([...YTD_ROWS, ...MTD_ROWS], YTD, "SAR_MKT");
    expect(both.sold!.scope).toBe("ytd");
    expect(both.sold!.soldCount).toBe(only.sold!.soldCount);
    expect(both.sold!.netAfterCancelsDollars).toBeCloseTo(9_298_896, 2);
  });

  test("the month view answers from the MTD snapshot and never borrows YTD net", () => {
    const { sold } = buildReportFacts([...YTD_ROWS, ...MTD_ROWS], AUG, "SAR_MKT");
    expect(sold!.scope).toBe("mtd");
    expect(sold!.soldCount).toBe(30);
    expect(sold!.cancelCount).toBe(2);
    // The YTD snapshot's $9.3M net must not leak into an August view.
    expect(sold!.netAfterCancelsDollars).toBeNull();
  });

  test("two snapshots sharing a period_start are never summed", () => {
    // A custom Jan 1 → Aug 5 pull alongside the Jan 1 → Sep 2 YTD: both cover
    // the YTD view. Summing them would double every figure.
    const custom = YTD_ROWS.map((r) => ({
      ...r, scope: "custom" as const, period_end: "2026-08-05", as_of_date: "2026-08-04",
    }));
    const { sold } = buildReportFacts([...YTD_ROWS, ...custom], YTD, "SAR_MKT");
    expect(sold!.scope).toBe("ytd");
    expect(sold!.soldCount).toBe(485); // not 970
  });
});

describe("coversPeriod", () => {
  const row = SOURCE_COST[0]!;
  test("same window, as-of inside → covered", () => {
    expect(coversPeriod(row, YTD)).toBe(true);
  });
  test("different period_start → not covered", () => {
    expect(coversPeriod(row, MTD)).toBe(false);
  });
  test("MULTI-MONTH: a snapshot short of the as-of is not covered", () => {
    // Strict, and it must stay strict. A snapshot covering only January being
    // accepted as the answer for a Jan–Aug period is the §10 defect in another
    // costume, and it would suppress the month-composition path below, which
    // only runs when nothing claims to cover.
    expect(coversPeriod({ ...row, period_end: "2026-07-31" }, YTD)).toBe(false);
  });

  test("SINGLE MONTH: a one-day-lagging snapshot IS covered (2026-08-13 fix)", () => {
    // THE BUG. Report 137's MTD file runs the morning AFTER the day it covers,
    // so its newest snapshot reaches yesterday while `asOf` is the last
    // completed selling day — every day, structurally. The old rule required
    // period_end >= asOf, so the current month was permanently blacked out:
    // Fort Myers August rendered Cancellations "not yet sourced" and Net
    // (Report 137 NSA) "—" while the warehouse held $28,443 and $366,676 for
    // exactly that market and window.
    const augMtd = { ...MTD, asOf: "2026-08-12" } as ResolvedPeriod;
    expect(coversPeriod({ ...row, period_start: "2026-08-01", period_end: "2026-08-11" }, augMtd)).toBe(true);
  });

  test("a window that OVERRUNS the as-of is accepted here, and gated elsewhere", () => {
    // Stated plainly because it is easy to assume otherwise: this predicate does
    // NOT reject an overshooting window, and never did. LP generates MTD files
    // with the month-end as the requested range — period_start 2026-08-01,
    // period_end 2026-08-31, generated on the 10th — so the shape is routine.
    //
    // What stops that file being read as a full month is `is_partial_month`,
    // which the ingest sets and `lp_cohort_maturation` uses to publish a NULL
    // data_through. The guard lives there, not here. Pinning the behaviour so a
    // future reader does not add a second, conflicting one.
    const augMtd = { ...MTD, periodEnd: "2026-08-12", asOf: "2026-08-12" } as ResolvedPeriod;
    expect(coversPeriod({ ...row, period_start: "2026-08-01", period_end: "2026-08-31" }, augMtd)).toBe(true);
  });

  test("SINGLE MONTH: a snapshot from a different month is never covered", () => {
    const augMtd = { ...MTD, asOf: "2026-08-12" } as ResolvedPeriod;
    expect(coversPeriod({ ...row, period_start: "2026-07-01", period_end: "2026-07-31" }, augMtd)).toBe(false);
  });
});

/**
 * The lead grain (2026-08-13). `leads` is report 135's ROW count — 135 is
 * emitted at lead × disposition-state grain — and these two are the same
 * period counted by LEAD. `leads_superseded` is LP's own NumSuperseded, its
 * record of duplicate leads folded into a survivor.
 */
describe("Leads at lead grain — the duplicate count", () => {
  test("both figures read, and SUM across a market's branch rows", () => {
    // Additive by construction: LP-MCP gives each lead exactly one owning
    // branch (lowest row_num) so that this summation is correct. Without that
    // rule the 429 leads appearing under two branches would be double-counted.
    const { leads } = buildReportFacts(
      [
        ld("ORL_MKT", "leads", null, 1_800),
        ld("ORL_MKT", "leads_distinct", null, 1_700),
        ld("ORL_MKT", "leads_superseded", null, 22),
        { ...ld("ORL_MKT", "leads_distinct", null, 300), branch_code_raw: "LAKE" },
        { ...ld("ORL_MKT", "leads_superseded", null, 5), branch_code_raw: "LAKE" },
      ],
      YTD,
      "REECE",
    );
    // E7: the PUBLISHED actual is the distinct count.
    expect(leads!.leads).toBe(2_000);
    expect(leads!.superseded).toBe(27);
    // The row count is untouched and still readable beside it, as the secondary.
    expect(leads!.leadRows).toBe(1_800);
  });

  test("ABSENT is null, never the row count — a snapshot with no lead grain", () => {
    const { leads } = buildReportFacts([ld("ORL_MKT", "leads", null, 1_800)], YTD, "REECE");
    // ⚠️ E7: `leads` must NOT fall back to the row count. A silent unit switch —
    // rendering 1,800 rows in a cell the Leads TARGET measures in distinct
    // leads — is the exact defect the re-base removes, and it would be invisible
    // on screen. Unmeasured is the correct, visible failure.
    expect(leads!.leads).toBeNull();
    expect(leads!.leadRows).toBe(1_800);
    // This is the raw_leads_in defect class: coerce absent to 0 and "we did not
    // measure" becomes indistinguishable from "there were none".
    expect(leads!.superseded).toBeNull();
  });

  test("ZERO duplicates is a REAL answer and survives as 0", () => {
    const { leads } = buildReportFacts(
      [
        ld("ORL_MKT", "leads", null, 900),
        ld("ORL_MKT", "leads_distinct", null, 900),
        ld("ORL_MKT", "leads_superseded", null, 0),
      ],
      YTD,
      "REECE",
    );
    expect(leads!.superseded).toBe(0);
    expect(leads!.superseded).not.toBeNull();
  });
});
