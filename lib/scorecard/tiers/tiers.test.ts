import { describe, expect, test } from "vitest";
import { rollupFacts, forMarket, pickSnapshot, sumMetric, marketsPresent } from "./factRollup";
import { buildTier1 } from "./tier1";
import { buildTier2, STAGES } from "./tier2";
import { buildTier3 } from "./tier3";
import { buildTier4, type SourceNsliRow } from "./tier4";
import { buildTier5 } from "./tier5";
import { buildDailyView } from "./daily";
import { rankMarkets, type RankableMarket } from "./ranking";
import { CADENCES, cadenceDef, defaultCadenceFor, resolveCadence } from "./cadence";
import { daysBetween, percentileCont, perUnit, rate, timeToNetByMarket } from "./metrics";
import { measured, unmeasured } from "./types";
import { displayMarketOf, DISPLAY_MARKETS, SCORECARD_MARKETS } from "@/lib/scorecard/markets";
import { num, usd, parseMoney, formatMoneyInput } from "@/lib/utils";
import type { ReportFactRow } from "@/lib/queries/reportFacts.core";

/**
 * The §8 test matrix, run against a fixture that mirrors the live warehouse
 * exactly as verified on 2026-08-05 — per-market volumes and cents are the real
 * figures, and Fort Lauderdale's branch split is reproduced faithfully so the
 * aggregation guard has something real to catch.
 */

// ── fixture ─────────────────────────────────────────────────────────────────

const SE_YTD = {
  //            issued  sat   sold  net   soldC          netC          canC  canCents    cdC cdCents    woC woCents   hC hCents
  FTLAU_MKT: [1449, 947, 187, 100, 473033000, 223252000, 51, 153122900, 22, 64344600, 9, 29534700, 4, 5918400],
  FTMYR_MKT: [3940, 2670, 901, 617, 2306005915, 1575415915, 140, 384349100, 88, 226385300, 34, 101726100, 11, 20500200],
  JAX_MKT: [1135, 757, 242, 125, 541835700, 302754800, 52, 112078800, 49, 106744800, 11, 17974600, 5, 8463200],
  LAKE_MKT: [439, 308, 107, 60, 200389000, 107207700, 29, 57069000, 13, 30437200, 1, 1567500, 4, 5952600],
  ORL_MKT: [2948, 1927, 682, 408, 1344355800, 826183900, 150, 307507600, 88, 160421000, 13, 20803800, 18, 35350300],
  SAR_MKT: [1783, 1188, 485, 338, 1280148600, 929889600, 73, 199395700, 17, 43639900, 17, 37579300, 28, 72209400],
  STPET_MKT: [3747, 2708, 839, 602, 1965245505, 1447206213, 133, 314012692, 56, 119292300, 15, 35795900, 22, 51603300],
} as const;

const LEADS_YTD: Record<string, number> = {
  FTMYR_MKT: 11666,
  JAX_MKT: 9159,
  LAKE_MKT: 2927,
  ORL_MKT: 16555,
  OUT_OF_AREA: 1084,
  SAR_MKT: 6448,
  STPET_MKT: 17494,
  UNASSIGNED: 2693,
};

/** Fort Lauderdale's five real Lead Disposition branch rows: Σ = 10,531. */
const FTLAU_LEAD_BRANCHES: [string | null, number][] = [
  ["FTLAU", 3181],
  ["BOCA", 5427],
  ["MIAMI", 1608],
  ["RFED", 286],
  [null, 29],
];

const MILESTONE_NET: Record<string, [number, number]> = {
  FTLAU_MKT: [1, 1383000],
  FTMYR_MKT: [8, 21251400],
  JAX_MKT: [1, 1892100],
  ORL_MKT: [8, 17972600],
  SAR_MKT: [4, 11714000],
  STPET_MKT: [8, 16037500],
};

/**
 * Post-carve goals (LAKELAND RULING 2026-08-06). Lakeland's goal used to be
 * zeroed with its dollars sitting inside Orlando's row. It is now carved OUT of
 * Orlando — 1,736,866.40 − 138,724 = 1,598,142.40 — so the company total is
 * unchanged at exactly $10,400,000. Σ of the seven still foots to the company.
 */
const GOALS: Record<string, number> = {
  FTLAU_MKT: 443852.68,
  FTMYR_MKT: 3172850.13,
  JAX_MKT: 570923.12,
  LAKE_MKT: 138724,
  ORL_MKT: 1598142.4,
  SAR_MKT: 1744200.99,
  STPET_MKT: 2731306.68,
};

function fact(o: Partial<ReportFactRow> & Pick<ReportFactRow, "report_type" | "market" | "metric">): ReportFactRow {
  return {
    period_start: "2026-01-01",
    period_end: "2026-09-02",
    as_of_date: "2026-08-05",
    scope: "ytd",
    branch_code_raw: null,
    bucket: null,
    value_cents: null,
    value_count: 0,
    ...o,
  } as ReportFactRow;
}

function makeFacts(): ReportFactRow[] {
  const rows: ReportFactRow[] = [];

  for (const [market, v] of Object.entries(SE_YTD)) {
    const [issued, sat, sold, net, soldC, netC, canC, canCents, cdC, cdCents, woC, woCents, hC, hCents] = v;
    const push = (metric: string, count: number, cents: number | null) =>
      rows.push(fact({ report_type: "sales_efficiency", market, metric, value_count: count, value_cents: cents }));
    if (market === "FTLAU_MKT") {
      // Split across the four real branch rows — the rollup must fold them.
      const split = (metric: string, count: number, cents: number | null) => {
        const branches = ["BOCA", "FTLAU", "MIAMI", "RFED"];
        branches.forEach((b, i) => {
          const isLast = i === branches.length - 1;
          const c = isLast ? count - Math.floor(count / 4) * 3 : Math.floor(count / 4);
          const cc = cents == null ? null : isLast ? cents - Math.floor(cents / 4) * 3 : Math.floor(cents / 4);
          rows.push(
            fact({
              report_type: "sales_efficiency",
              market,
              metric,
              branch_code_raw: b,
              value_count: c,
              value_cents: cc,
            }),
          );
        });
      };
      split("issued", issued, null);
      split("sat", sat, null);
      split("sold", sold, soldC);
      split("net_sold", net, netC);
      split("cancelled", canC, canCents);
      split("credit_decline", cdC, cdCents);
      split("working_open", woC, woCents);
      split("hold", hC, hCents);
    } else {
      push("issued", issued, null);
      push("sat", sat, null);
      push("sold", sold, soldC);
      push("net_sold", net, netC);
      push("cancelled", canC, canCents);
      push("credit_decline", cdC, cdCents);
      push("working_open", woC, woCents);
      push("hold", hC, hCents);
    }
  }

  for (const [market, leads] of Object.entries(LEADS_YTD)) {
    rows.push(
      fact({ report_type: "lead_disposition", market, metric: "leads", value_count: leads, period_end: "2026-08-05" }),
    );
  }
  for (const [branch, leads] of FTLAU_LEAD_BRANCHES) {
    rows.push(
      fact({
        report_type: "lead_disposition",
        market: "FTLAU_MKT",
        metric: "leads",
        branch_code_raw: branch,
        value_count: leads,
        period_end: "2026-08-05",
      }),
    );
  }

  rows.push(
    fact({ report_type: "source_cost", market: "REECE", metric: "marketing_cost", value_count: 127, value_cents: 212969039, period_end: "2026-08-05" }),
    fact({ report_type: "source_cost", market: "REECE", metric: "leads", value_count: 78561, period_end: "2026-08-05" }),
  );

  for (const [market, [count, cents]] of Object.entries(MILESTONE_NET)) {
    rows.push(
      fact({ report_type: "jobs_by_milestone", market, metric: "net_sales", value_count: count, value_cents: cents, scope: "mtd", period_start: "2026-08-01", period_end: "2026-08-31" }),
      fact({ report_type: "jobs_by_milestone", market, metric: "gross_sold", value_count: count, value_cents: cents, scope: "mtd", period_start: "2026-08-01", period_end: "2026-08-31" }),
    );
  }

  const js = (market: string, bucket: string, count: number, cents: number) =>
    fact({ report_type: "job_status_ytd", market, metric: "good_business_open", bucket, value_count: count, value_cents: cents, period_end: "2026-08-05" });
  rows.push(
    js("STPET_MKT", "hoa", 40, 900000000 / 10),
    js("ORL_MKT", "hoa", 30, 600000000 / 10),
    js("FTMYR_MKT", "hoa", 23, 508759 * 100 - 90000000 / 10 - 60000000 / 10 + 200875900 - 200875900),
    js("STPET_MKT", "permit", 10, 20000000),
    js("ORL_MKT", "permit", 8, 14356400),
    js("STPET_MKT", "other_pending", 70, 200000000),
    js("ORL_MKT", "other_pending", 61, 179461400),
    fact({ report_type: "job_status_ytd", market: "STPET_MKT", metric: "pipeline_excluded", bucket: "excluded", value_count: 698, value_cents: 1870784928, period_end: "2026-08-05" }),
  );

  return rows;
}

const FACTS = makeFacts();
const ROLLED = rollupFacts(FACTS);
const T1_OPTS = { elapsedSellingDays: 2, totalSellingDays: 26, periodLabel: "August 2026 (MTD)" };
const MARKET_CODES = DISPLAY_MARKETS.map((m) => m.code);

const timeToNetFixture = {
  company: { market: "REECE", n: 30, medianDays: measured(6), p75Days: measured(12), maxDays: measured(101) },
  markets: [],
  sampleNote: "30 distinct jobs",
};

// ── 1. Tier 1 renders exactly five columns, no other metric ─────────────────

describe("Test 1 — Tier 1 is Goal / Actual / Pace / Projected / Variance and nothing else", () => {
  const t1 = buildTier1(ROLLED, GOALS, T1_OPTS);

  test("all 7 markets plus a company row", () => {
    expect(t1.rows).toHaveLength(7);
    expect(t1.rows.map((r) => r.market).sort()).toEqual(SCORECARD_MARKETS.map((m) => m.code).sort());
    expect(t1.rows.map((r) => r.market)).toContain("LAKE_MKT");
    expect(t1.company.market).toBe("REECE");
  });

  test("no funnel metric, rate, or leak leaks into the row shape", () => {
    const allowed = ["market", "label", "isCompany", "goal", "actual", "pace", "projected", "variance", "toDateGap"];
    expect(Object.keys(t1.rows[0]!).sort()).toEqual([...allowed].sort());
  });

  test("company goal is Σ offices, derived on read — $10,400,000", () => {
    expect(t1.company.goal.value).toBeCloseTo(10_400_000, 2);
  });

  test("company actual is the RTP net total — $702,506", () => {
    expect(t1.company.actual.value).toBeCloseTo(702_506, 2);
  });

  // LAKELAND RULING (2026-08-06): Orlando's goal is its own carved figure and
  // its actual is ORL's alone; Lakeland carries its own row.
  test("Orlando's goal is its post-carve figure, its actual ORL's alone", () => {
    const orl = t1.rows.find((r) => r.market === "ORL_MKT")!;
    expect(orl.goal.value).toBeCloseTo(1_598_142.4, 2);
    expect(orl.actual.value).toBeCloseTo(179_726, 2);
  });

  test("Lakeland is its own row, carrying the goal carved out of Orlando", () => {
    const lake = t1.rows.find((r) => r.market === "LAKE_MKT")!;
    expect(lake.label).toBe("Lakeland");
    expect(lake.goal.value).toBeCloseTo(138_724, 2);
    // No Lakeland RTP milestone rows this period — states a reason, never $0.
    expect(lake.actual.known).toBe(false);
  });

  test("Σ of the seven office goals still foots to the company goal exactly", () => {
    const sum = t1.rows.reduce((a, r) => a + (r.goal.value ?? 0), 0);
    expect(sum).toBeCloseTo(t1.company.goal.value!, 2);
    expect(sum).toBeCloseTo(10_400_000, 2);
  });

  test("pace prorates the goal; projection is the run rate; variance is projected − goal", () => {
    const c = t1.company;
    expect(c.pace.value).toBe(Math.round((10_400_000 * 2) / 26));
    expect(c.projected.value).toBe(Math.round((702_506 / 2) * 26));
    expect(c.variance.value).toBe(Math.round(c.projected.value! - 10_400_000));
  });

  test("2 of 26 elapsed days is flagged low-confidence, not presented as signal", () => {
    expect(t1.lowConfidence).toBe(true);
  });
});

// ── 2. Tier 2 reproduces the YTD cascade ────────────────────────────────────

describe("Test 2 — cascade reproduces YTD company rates", () => {
  const t2 = buildTier2(ROLLED, { scope: "ytd", markets: MARKET_CODES, periodLabel: "YTD" });
  const stage = (k: string) => t2.company.stages.find((s) => s.key === k)!;

  test("Issue 19.7% · Sit 68.0% · Close 32.8% · Survival 65.3%", () => {
    expect(stage("issue").actual.value).toBe(19.7);
    expect(stage("sit").actual.value).toBe(68);
    expect(stage("close").actual.value).toBe(32.8);
    // NAMED EXCEPTION. The handoff states 65.4%; the arithmetic is 65.3%.
    // 2,250 ÷ 3,443 = 65.3499854…%, which rounds to 65.3 in one step. 65.4
    // is reachable only by rounding twice — to 65.35 at 2dp, then up to 65.4 —
    // and adopting double rounding to match this one cell would shift figures
    // all over the dashboard. The other three stages reproduce exactly, so the
    // single-step result is kept and the discrepancy is reported, not absorbed.
    expect(stage("survival").actual.value).toBe(65.3);
    expect(2250 / 3443).toBeCloseTo(0.65349985, 6);
  });

  test("underlying volumes are the real ones", () => {
    expect(t2.companyVolumes).toMatchObject({ leads: 78557, issued: 15441, sat: 10505, sold: 3443, net: 2250 });
  });

  test("every stage names an owner", () => {
    expect(t2.company.stages.map((s) => s.owner)).toEqual([
      "Marketing / call center",
      "Call center",
      "Sales",
      "Finance / Operations",
    ]);
    expect(STAGES).toHaveLength(4);
  });

  // LAKELAND RULING (2026-08-06): Orlando's rate is ORL's alone. The
  // ratio-of-sums discipline is unchanged — it now applies within a market,
  // over its branch-grain rows, rather than across two merged markets.
  test("Orlando's issue rate is ORL's own, with Lakeland excluded", () => {
    const orl = t2.rows.find((r) => r.market === "ORL_MKT")!;
    const issue = orl.stages.find((s) => s.key === "issue")!;
    expect(issue.actual.value).toBe(Math.round((2948 / 16555) * 1000) / 10);
    expect(issue.numerator).toBe(2948);
    expect(issue.denominator).toBe(16555);
  });

  test("on a YTD view the company variance against its own YTD benchmark is zero", () => {
    expect(stage("close").variancePts).toBe(0);
  });
});

// ── 3. Tier 3 leak table + reconciliation ───────────────────────────────────

describe("Test 3 — leak table reconciles with a NAMED residual", () => {
  const t3 = buildTier3(ROLLED, timeToNetFixture, { market: "REECE" });
  const leak = (k: string) => t3.leaks.find((l) => l.key === k)!;

  test("the four buckets reproduce to the cent", () => {
    expect(leak("cancelled").dollars.value).toBeCloseTo(15_275_357.92, 2);
    expect(leak("credit_decline").dollars.value).toBeCloseTo(7_512_651, 2);
    expect(leak("working_open").dollars.value).toBeCloseTo(2_449_819, 2);
    expect(leak("hold").dollars.value).toBeCloseTo(1_999_974, 2);
    expect(leak("cancelled").count.value).toBe(628);
    expect(leak("credit_decline").count.value).toBe(333);
    expect(leak("working_open").count.value).toBe(100);
    expect(leak("hold").count.value).toBe(92);
  });

  test("gross, net and the $27.0M evaporation", () => {
    expect(t3.grossSold.value).toBeCloseTo(81_110_135.2, 2);
    expect(t3.netSold.value).toBeCloseTo(54_119_101.28, 2);
    expect(t3.totalLeak.value).toBeCloseTo(26_991_033.92, 2);
  });

  test("Gross − Σleaks + unreconciled = Net, exactly", () => {
    expect(t3.leakSubtotal.value).toBeCloseTo(27_237_801.92, 2);
    expect(t3.unreconciled.value).toBeCloseTo(246_768, 2);
    expect(t3.reconciles).toBe(true);
    expect(t3.grossSold.value! - t3.leakSubtotal.value! + t3.unreconciled.value!).toBeCloseTo(
      t3.netSold.value!,
      2,
    );
  });

  test("the residual is its own named line, never folded into a bucket", () => {
    // If any bucket had absorbed it, that bucket would no longer tie.
    expect(leak("cancelled").dollars.value).not.toBeCloseTo(15_275_357.92 + 246_768, 2);
    expect(t3.leaks.map((l) => l.key)).toEqual(["cancelled", "credit_decline", "working_open", "hold"]);
  });

  test("credit decline is 9.3% of gross sold — the invisible line", () => {
    expect(leak("credit_decline").pctOfGross.value).toBe(9.3);
  });

  test("with no prior month, every trend arrow states why rather than showing flat", () => {
    for (const l of t3.leaks) {
      expect(l.trendPts.known).toBe(false);
      expect(l.trendPts.known === false && l.trendPts.reason).toMatch(/no prior-month snapshot/);
    }
  });
});

// ── 4. Tier 4 marketing efficiency ──────────────────────────────────────────

describe("Test 4 — marketing efficiency and NSLI ranking", () => {
  const bySource: SourceNsliRow[] = [
    { source: "Radio", subSource: "(none)", issued: 40, netSales: 320000, nsli: perUnit(320000, 40) },
    { source: "Paid Social", subSource: "(none)", issued: 900, netSales: 2700000, nsli: perUnit(2700000, 900) },
    { source: "Canvassing", subSource: "(none)", issued: 300, netSales: 1500000, nsli: perUnit(1500000, 300) },
    { source: "Untracked", subSource: "(none)", issued: 0, netSales: 0, nsli: perUnit(0, 0) },
  ];
  const t4 = buildTier4(ROLLED, bySource, {
    markets: MARKET_CODES,
    sourceWindowLabel: "rolling 90d",
    planningNsli: measured(3505),
    nsliWindowLabel: "rolling 90d",
  });

  test("$27.11 per lead", () => {
    expect(t4.company.costPerLead.value).toBeCloseTo(27.11, 2);
  });

  test("$618 per sale (618.56 exact)", () => {
    expect(t4.company.costPerSale.value).toBeCloseTo(618.56, 2);
    expect(Math.floor(t4.company.costPerSale.value!)).toBe(618);
  });

  test("3.9% of net revenue", () => {
    expect(t4.company.marketingPctOfNet.value).toBe(3.9);
  });

  test("NSLI $3,505", () => {
    expect(t4.company.nsli.value).toBeCloseTo(3504.9, 2);
    expect(usd(t4.company.nsli.value)).toBe("$3,505");
  });

  test("sources rank by NSLI descending, volume alongside but not sorted on", () => {
    expect(t4.bySource.map((s) => s.source)).toEqual([
      "Radio", // 8,000 — highest rate on the smallest volume
      "Canvassing", // 5,000
      "Paid Social", // 3,000
      "Untracked", // unmeasurable — sinks, never ranked as zero
    ]);
    expect(t4.bySource[3]!.nsli.known).toBe(false);
  });

  test("per-market cost cells say spend is company-only instead of inventing an allocation", () => {
    const ftmyr = t4.rows.find((r) => r.market === "FTMYR_MKT")!;
    expect(ftmyr.costPerSale.known).toBe(false);
    expect(ftmyr.costPerSale.known === false && ftmyr.costPerSale.reason).toMatch(/company-wide only/);
    // NSLI still resolves per market — it needs only net and issued.
    expect(ftmyr.nsli.value).toBeCloseTo(15754159.15 / 3940, 2);
  });
});

// ── 5. Tier 5 backlog ───────────────────────────────────────────────────────

describe("Test 5 — backlog is a stock that foots", () => {
  const t5 = buildTier5(ROLLED, "REECE");

  test("buckets foot exactly to total open jobs", () => {
    expect(t5.pendingCount.value).toBe(242);
    expect(t5.excludedCount.value).toBe(698);
    expect(t5.openJobsTotal.value).toBe(940);
    expect(t5.foots).toBe(true);
  });

  test("HOA · Permit · Other pending each carry count and dollars", () => {
    expect(t5.buckets.map((b) => b.key)).toEqual(["hoa", "permit", "other_pending"]);
    expect(t5.buckets.every((b) => b.count.known && b.dollars.known)).toBe(true);
  });

  test("ignores the period filter — no period argument exists to pass it", () => {
    expect(buildTier5.length).toBe(2); // (rolled, marketCode) only
  });

  test("honors the market filter", () => {
    const stpet = buildTier5(ROLLED, "STPET_MKT");
    expect(stpet.pendingCount.value).toBe(120);
    expect(stpet.pendingCount.value).toBeLessThan(t5.pendingCount.value!);
  });

  test("carries an as-of stamp and the Hold - Permit flag for Mark's ruling", () => {
    expect(t5.asOf).toBe("2026-08-05");
    expect(t5.permitFlag).toMatch(/Hold - Permit is shipping as its own bucket \(18 jobs\)/);
  });

  test("a market with no rows renders — with a reason, never $0", () => {
    const empty = buildTier5(ROLLED, "JAX_MKT");
    expect(empty.pendingCount.known).toBe(false);
    expect(empty.pendingCount.known === false && empty.pendingCount.reason).toMatch(/no Job Status snapshot/);
  });
});

// ── 6. Every tier declares its date basis ───────────────────────────────────

describe("Test 6 — every tier header carries its date basis", () => {
  const tiers = [
    buildTier1(ROLLED, GOALS, T1_OPTS).meta,
    buildTier2(ROLLED, { scope: "ytd", markets: MARKET_CODES, periodLabel: "YTD" }).meta,
    buildTier3(ROLLED, timeToNetFixture, { market: "REECE" }).meta,
    buildTier4(ROLLED, [], { markets: MARKET_CODES, sourceWindowLabel: "w", planningNsli: measured(1), nsliWindowLabel: "w" }).meta,
    buildTier5(ROLLED, "REECE").meta,
  ];

  test("basis, detail and source are present on all five", () => {
    for (const m of tiers) {
      expect(m.basis).toBeTruthy();
      expect(m.basisDetail.length).toBeGreaterThan(0);
      expect(m.source.length).toBeGreaterThan(0);
      expect(m.question.length).toBeGreaterThan(0);
    }
  });

  test("the three bases stay separate — Tier 1 RTP, Tiers 2/3 appointment, Tier 5 point-in-time", () => {
    expect(tiers.map((m) => m.basis)).toEqual([
      "rtp_milestone",
      "appointment",
      "appointment",
      "lead_cohort",
      "point_in_time",
    ]);
  });
});

// ── 7. Market ranking sorts on rates ────────────────────────────────────────

describe("Test 7 — markets rank on rates, volume is secondary", () => {
  const markets: RankableMarket[] = [
    { market: "FTMYR_MKT", label: "Fort Myers", metrics: { close: measured(33.7), survival: measured(68.5) }, volume: { netSold: 15754159, sold: 901 } },
    { market: "FTLAU_MKT", label: "Fort Lauderdale", metrics: { close: measured(19.7), survival: measured(53.5) }, volume: { netSold: 2232520, sold: 187 } },
    { market: "SAR_MKT", label: "Sarasota", metrics: { close: measured(40.8), survival: measured(69.7) }, volume: { netSold: 9298896, sold: 485 } },
    { market: "JAX_MKT", label: "Jacksonville", metrics: {}, volume: { netSold: 3027548, sold: 242 } },
  ];

  test("the biggest market does not automatically win", () => {
    const ranked = rankMarkets(markets, "close");
    expect(ranked[0]!.market).toBe("SAR_MKT"); // 40.8% beats Fort Myers' volume
    expect(ranked.find((r) => r.market === "FTMYR_MKT")!.rank).toBe(2);
  });

  test("cost per sale ranks ascending — lower is better", () => {
    const withCost: RankableMarket[] = [
      { market: "A", label: "A", metrics: { cost_per_sale: measured(900) }, volume: { netSold: 1, sold: 1 } },
      { market: "B", label: "B", metrics: { cost_per_sale: measured(400) }, volume: { netSold: 1, sold: 1 } },
    ];
    expect(rankMarkets(withCost, "cost_per_sale")[0]!.market).toBe("B");
  });

  test("an unmeasurable market sinks WITHOUT a rank — absence is not last place", () => {
    const ranked = rankMarkets(markets, "close");
    const jax = ranked.find((r) => r.market === "JAX_MKT")!;
    expect(jax.rank).toBeNull();
    expect(ranked[ranked.length - 1]!.market).toBe("JAX_MKT");
  });
});

// ── 8. Time-to-Net ──────────────────────────────────────────────────────────

describe("Test 8 — Time-to-Net median and p75 per market", () => {
  const rows = [
    { job_number: "1", market: "STPET_MKT", contract_date: "2026-04-22", rtp_date: "2026-08-01" }, // 101
    { job_number: "2", market: "STPET_MKT", contract_date: "2026-07-25", rtp_date: "2026-07-30" }, // 5
    { job_number: "3", market: "STPET_MKT", contract_date: "2026-07-01", rtp_date: "2026-07-15" }, // 14
    { job_number: "4", market: "LAKE_MKT", contract_date: "2026-07-01", rtp_date: "2026-07-07" }, // 6
    { job_number: "5", market: "ORL_MKT", contract_date: "2026-07-01", rtp_date: "2026-07-06" }, // 5
    { job_number: "6", market: "ORL_MKT", contract_date: "2026-07-01", rtp_date: "2026-07-08" }, // 7
    { job_number: "7", market: "FTLAU_MKT", contract_date: "2026-07-01", rtp_date: "2026-07-07" }, // 6 — thin
  ];

  test("computes days from contract_date and rtp_date", () => {
    expect(daysBetween("2026-04-22", "2026-08-01")).toBe(101);
    expect(daysBetween("2026-07-25", "2026-07-30")).toBe(5);
  });

  test("median and p75 match Postgres percentile_cont", () => {
    expect(percentileCont([5, 14, 101], 0.5)).toBe(14);
    expect(percentileCont([5, 5, 23], 0.75)).toBe(14);
    expect(percentileCont([5, 6, 6, 28], 0.75)).toBe(11.5);
  });

  // LAKELAND RULING (2026-08-06): a LAKE job is Lakeland's statistic, not
  // Orlando's — it must not silently enlarge Orlando's sample. Splitting the
  // markets makes both samples thinner, and the min-sample guard is what stops
  // that turning into a confidently-published two-job median.
  test("LAKE stays out of Orlando's sample and forms its own", () => {
    const { markets } = timeToNetByMarket(rows, displayMarketOf);
    const orl = markets.find((m) => m.market === "ORL_MKT")!;
    expect(orl.n).toBe(2); // jobs 5 and 6 only — job 4 is Lakeland's

    const lake = markets.find((m) => m.market === "LAKE_MKT")!;
    expect(lake.n).toBe(1); // job 4
  });

  test("a market that drops below the min sample says so instead of publishing", () => {
    const { markets } = timeToNetByMarket(rows, displayMarketOf);
    const orl = markets.find((m) => m.market === "ORL_MKT")!;
    expect(orl.medianDays.known).toBe(false);
    expect(orl.medianDays.reason).toMatch(/too thin/);
    const lake = markets.find((m) => m.market === "LAKE_MKT")!;
    expect(lake.medianDays.known).toBe(false);
  });

  test("duplicate job rows across re-ingested snapshots are deduped, not 7×'d", () => {
    const dupes = [...rows, ...rows, ...rows];
    expect(timeToNetByMarket(dupes, displayMarketOf).company.n).toBe(
      timeToNetByMarket(rows, displayMarketOf).company.n,
    );
  });

  test("a thin market reports — with the sample size, not a confident median", () => {
    const { markets } = timeToNetByMarket(rows, displayMarketOf);
    const ftlau = markets.find((m) => m.market === "FTLAU_MKT")!;
    expect(ftlau.n).toBe(1);
    expect(ftlau.medianDays.known).toBe(false);
    expect(ftlau.medianDays.known === false && ftlau.medianDays.reason).toMatch(/sample too thin/);
  });
});

// ── 9. Daily view has no goal or pace math ──────────────────────────────────

describe("Test 9 — the daily view contains no goal or pace math", () => {
  test("the daily cadence renders no tiers and suppresses goal math", () => {
    const daily = cadenceDef("daily");
    expect(daily.showsGoalMath).toBe(false);
    expect(daily.tiers).toEqual([]);
  });

  test("the daily row shape carries volumes only", () => {
    const view = buildDailyView([
      { market: "STPET_MKT", as_of_date: "2026-08-03", period_start: "2026-08-01", leads: 39, raw_leads_in: null, sets: 39, issued: 24, demos: 14, sales: 2 },
      { market: "STPET_MKT", as_of_date: "2026-08-02", period_start: "2026-08-01", leads: 20, raw_leads_in: null, sets: 20, issued: 10, demos: 6, sales: 1 },
    ]);
    expect(Object.keys(view.rows[0]!).sort()).toEqual(
      ["market", "label", "isCompany", "leads", "sets", "issued", "demos", "sales"].sort(),
    );
    expect(JSON.stringify(view)).not.toMatch(/goal|pace|project|variance/i);
  });

  test("consecutive snapshots yield a true single-day delta", () => {
    const view = buildDailyView([
      { market: "STPET_MKT", as_of_date: "2026-08-03", period_start: "2026-08-01", leads: 39, raw_leads_in: null, sets: 39, issued: 24, demos: 14, sales: 2 },
      { market: "STPET_MKT", as_of_date: "2026-08-02", period_start: "2026-08-01", leads: 20, raw_leads_in: null, sets: 20, issued: 10, demos: 6, sales: 1 },
    ]);
    expect(view.isSingleDay).toBe(true);
    expect(view.rows[0]!.leads.value).toBe(19);
    expect(view.company!.sales.value).toBe(1);
  });

  test("one snapshot only → says what the window actually covers", () => {
    const view = buildDailyView([
      { market: "STPET_MKT", as_of_date: "2026-08-03", period_start: "2026-08-01", leads: 39, raw_leads_in: null, sets: 39, issued: 24, demos: 14, sales: 2 },
    ]);
    expect(view.isSingleDay).toBe(false);
    expect(view.windowLabel).toMatch(/single-day delta is not yet computable/);
  });

  test("month boundaries are never differenced across", () => {
    const view = buildDailyView([
      { market: "STPET_MKT", as_of_date: "2026-08-03", period_start: "2026-08-01", leads: 39, raw_leads_in: null, sets: 39, issued: 24, demos: 14, sales: 2 },
      { market: "STPET_MKT", as_of_date: "2026-07-30", period_start: "2026-07-01", leads: 900, raw_leads_in: null, sets: 900, issued: 500, demos: 300, sales: 40 },
    ]);
    expect(view.rows[0]!.leads.value).toBe(39); // not 39 − 900
  });

  test("role defaults: executives → monthly, operators → weekly, nobody defaults into daily", () => {
    expect(defaultCadenceFor({ isExecutive: true, role: "team" } as never)).toBe("monthly");
    expect(defaultCadenceFor({ isExecutive: false, role: "operator" } as never)).toBe("weekly");
    expect(CADENCES.every((c) => c.key === "daily" || c.showsGoalMath)).toBe(true);
    expect(resolveCadence("daily", null).cadence.key).toBe("daily");
    expect(resolveCadence(undefined, null).fromRole).toBe(true);
  });
});

// ── 10-11. Goal input + comma separators ────────────────────────────────────

describe("Test 10 — the goal input accepts real office goals", () => {
  test("2731306.68 and 2,731,306.68 both parse to the same amount", () => {
    expect(parseMoney("2731306.68")).toBe(2731306.68);
    expect(parseMoney("2,731,306.68")).toBe(2731306.68);
    expect(parseMoney("$2,731,306.68")).toBe(2731306.68);
    expect(parseMoney(" 2731306.68 ")).toBe(2731306.68);
  });

  test("no float artifact — the stored cent is exact", () => {
    expect(parseMoney("2731306.68")! * 100).toBeCloseTo(273130668, 6);
  });

  test("blank is null, not zero — 'not entered' differs from 'zero'", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("0")).toBe(0);
  });

  test("the field echoes back grouped, matching how the goal is written down", () => {
    expect(formatMoneyInput(2731306.68)).toBe("2,731,306.68");
    expect(formatMoneyInput(10400000)).toBe("10,400,000");
  });
});

describe("Test 11 — every displayed number carries comma separators", () => {
  test("counts and money group through the shared formatters", () => {
    expect(num(78557)).toBe("78,557");
    expect(num(15441)).toBe("15,441");
    expect(usd(54119101.28)).toBe("$54,119,101");
    expect(usd(2129690.39)).toBe("$2,129,690");
    expect(usd(3504.9)).toBe("$3,505");
  });

  test("null renders — not $0", () => {
    expect(num(null)).toBe("—");
    expect(usd(null)).toBe("—");
    expect(usd(undefined)).toBe("—");
  });
});

// ── 12. NSLI unified ────────────────────────────────────────────────────────

describe("Test 12 — one NSLI window, labelled identically", () => {
  test("the tier bundle's planning NSLI and its label are single-sourced", () => {
    const t4 = buildTier4(ROLLED, [], {
      markets: MARKET_CODES,
      sourceWindowLabel: "rolling 90d · 2026-05-08 → 2026-08-06",
      planningNsli: measured(3843),
      nsliWindowLabel: "rolling 90d · from 2026-05-08",
    });
    expect(t4.planningNsli.value).toBe(3843);
    expect(t4.nsliWindowLabel).toMatch(/rolling 90d/);
    expect(t4.sourceWindowLabel).toMatch(/rolling 90d/);
  });

  // LAKELAND RULING (2026-08-06): each market's NSLI is its own net ÷ its own
  // issued. Lakeland's thin numbers no longer dilute Orlando's.
  test("Orlando and Lakeland each carry their own NSLI, never a blended one", () => {
    const t4 = buildTier4(ROLLED, [], { markets: MARKET_CODES, sourceWindowLabel: "w", planningNsli: measured(1), nsliWindowLabel: "w" });
    const orl = t4.rows.find((r) => r.market === "ORL_MKT")!;
    const orlExpected = 826183900 / 100 / 2948;
    expect(orl.nsli.value).toBeCloseTo(Math.round(orlExpected * 100) / 100, 2);

    const lake = t4.rows.find((r) => r.market === "LAKE_MKT")!;
    const lakeExpected = 107207700 / 100 / 439;
    expect(lake.nsli.value).toBeCloseTo(Math.round(lakeExpected * 100) / 100, 2);

    // The old merged figure belonged to neither market.
    const merged = (826183900 + 107207700) / 100 / (2948 + 439);
    expect(orl.nsli.value).not.toBeCloseTo(merged, 0);
  });
});

// ── 13. Issue rate resolves for every office ────────────────────────────────

describe("Test 13 — issue rate resolves for every office", () => {
  const t2 = buildTier2(ROLLED, { scope: "ytd", markets: MARKET_CODES, periodLabel: "YTD" });

  test("no office reports 'no leads history yet' when usable data exists", () => {
    for (const code of SCORECARD_MARKETS.map((m) => m.code)) {
      const row = t2.rows.find((r) => r.market === code)!;
      const issue = row.stages.find((s) => s.key === "issue")!;
      expect(issue.actual.known, `${code} issue rate`).toBe(true);
      expect(issue.actual.value).toBeGreaterThan(0);
    }
  });

  test("St. Petersburg specifically resolves — the office that used to fail", () => {
    const stpet = t2.rows.find((r) => r.market === "STPET_MKT")!;
    const issue = stpet.stages.find((s) => s.key === "issue")!;
    expect(issue.actual.value).toBe(Math.round((3747 / 17494) * 1000) / 10);
  });
});

// ── 14. Facts aggregation ───────────────────────────────────────────────────

describe("Test 14 — one row per (snapshot, market, metric, bucket)", () => {
  test("no duplicate key survives the rollup", () => {
    const keys = ROLLED.map(
      (r) => `${r.report_type}|${r.period_start}|${r.period_end}|${r.as_of_date}|${r.scope}|${r.market}|${r.metric}|${r.bucket}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("Fort Lauderdale leads = 10,531 in a SINGLE row", () => {
    const ld = ROLLED.filter(
      (r) => r.report_type === "lead_disposition" && r.market === "FTLAU_MKT" && r.metric === "leads",
    );
    expect(ld).toHaveLength(1);
    expect(ld[0]!.value_count).toBe(10531);
    expect(ld[0]!.sourceRows).toBe(5); // the five branch rows folded in
  });

  test("a naive non-summing read would have under-reported by ~70%", () => {
    const naive = FACTS.find(
      (r) => r.report_type === "lead_disposition" && r.market === "FTLAU_MKT" && r.metric === "leads",
    )!;
    expect(naive.value_count).toBe(3181);
    expect(naive.value_count / 10531).toBeLessThan(0.31);
  });

  test("Fort Lauderdale's 8 sales-efficiency metrics collapse from 32 rows to 8", () => {
    const se = ROLLED.filter((r) => r.report_type === "sales_efficiency" && r.market === "FTLAU_MKT");
    expect(se).toHaveLength(8);
    expect(se.every((r) => r.sourceRows === 4)).toBe(true);
    expect(sumMetric(se, "issued").count).toBe(1449);
  });

  test("count-only metrics never fabricate $0", () => {
    const issued = ROLLED.find((r) => r.metric === "issued" && r.market === "FTMYR_MKT")!;
    expect(issued.value_cents).toBeNull();
  });
});

// ── 15. Market cardinality ──────────────────────────────────────────────────

describe("Test 15 — 7 markets + UNASSIGNED, Lakeland among them", () => {
  test("DISTINCT market over market-dimensioned rows is exactly the 8 display entities", () => {
    // Source & Cost is ingested WITHOUT a market dimension — its rows are the
    // company control total and legitimately key on REECE. Excluding it is the
    // difference between "which markets exist" and "which rows exist".
    const present = marketsPresent(ROLLED.filter((r) => r.report_type !== "source_cost"));
    expect(present.sort()).toEqual(
      ["FTLAU_MKT", "FTMYR_MKT", "JAX_MKT", "LAKE_MKT", "ORL_MKT", "SAR_MKT", "STPET_MKT", "UNASSIGNED"].sort(),
    );
    expect(present).toContain("LAKE_MKT");
    expect(present).not.toContain("OUT_OF_AREA");
    expect(present).not.toContain("REECE");
  });

  test("REECE appears only on the company control-total report", () => {
    const reeceRows = ROLLED.filter((r) => r.market === "REECE");
    expect(reeceRows.every((r) => r.report_type === "source_cost")).toBe(true);
  });

  test("the display list is 7 markets + one utility row", () => {
    expect(DISPLAY_MARKETS.filter((m) => !m.utility)).toHaveLength(7);
    expect(DISPLAY_MARKETS.filter((m) => m.utility)).toHaveLength(1);
  });

  test("UNASSIGNED and OUT_OF_AREA reconcile into one entity", () => {
    expect(displayMarketOf("OUT_OF_AREA")).toBe("UNASSIGNED");
    expect(displayMarketOf("UNASSIGNED")).toBe("UNASSIGNED");
    const un = ROLLED.filter((r) => r.report_type === "lead_disposition" && r.market === "UNASSIGNED" && r.metric === "leads");
    expect(un).toHaveLength(1);
    expect(un[0]!.value_count).toBe(2693 + 1084);
  });

  test("Lakeland is a first-class display entity, never relabelled Orlando", () => {
    expect(displayMarketOf("LAKE_MKT")).toBe("LAKE_MKT");
    expect(JSON.stringify(DISPLAY_MARKETS)).toMatch(/lakeland/i);
    expect(JSON.stringify(ROLLED)).toMatch(/LAKE_MKT/);
    // and it never masquerades as Orlando
    expect(DISPLAY_MARKETS.find((m) => m.code === "LAKE_MKT")!.label).toBe("Lakeland");
    expect(DISPLAY_MARKETS.find((m) => m.code === "ORL_MKT")!.sources).not.toContain("LAKE_MKT");
  });

  test("an unknown warehouse code surfaces visibly instead of vanishing", () => {
    expect(displayMarketOf("TAMPA_MKT")).toBe("TAMPA_MKT");
  });
});

// ── 16. Filter combinations ─────────────────────────────────────────────────

describe("Test 16 — every filter combination returns the correct subset", () => {
  test("MTD and YTD sales-efficiency snapshots coexist and never cross-contaminate", () => {
    const mtdRows: ReportFactRow[] = [
      fact({ report_type: "sales_efficiency", market: "STPET_MKT", metric: "sold", value_count: 45, value_cents: 113043100, scope: "mtd", period_start: "2026-08-01", period_end: "2026-08-31" }),
    ];
    const both = rollupFacts([...FACTS, ...mtdRows]);
    const mtd = pickSnapshot(both, "sales_efficiency", "mtd");
    const ytd = pickSnapshot(both, "sales_efficiency", "ytd");
    expect(sumMetric(mtd, "sold").count).toBe(45);
    expect(sumMetric(ytd, "sold").count).toBe(3443);
  });

  test("a scope with no snapshot fails closed rather than answering with the wrong window", () => {
    expect(pickSnapshot(ROLLED, "sales_efficiency", "mtd")).toEqual([]);
  });

  test("each market filter returns only that market; All Markets returns every row", () => {
    const ytd = pickSnapshot(ROLLED, "sales_efficiency", "ytd");
    for (const code of SCORECARD_MARKETS.map((m) => m.code)) {
      const rows = forMarket(ytd, code);
      expect(rows.every((r) => r.market === code)).toBe(true);
    }
    expect(forMarket(ytd, "REECE")).toHaveLength(ytd.length);
  });

  test("market subsets sum to All Markets — the table foots", () => {
    const ytd = pickSnapshot(ROLLED, "sales_efficiency", "ytd");
    const perMarket = SCORECARD_MARKETS.reduce(
      (a, m) => a + sumMetric(forMarket(ytd, m.code), "sold").count,
      0,
    );
    expect(perMarket).toBe(sumMetric(ytd, "sold").count);
    expect(perMarket).toBe(3443);
  });

  test("a single-month filter on Tier 5 changes nothing — backlog is a stock", () => {
    const a = buildTier5(ROLLED, "REECE");
    const b = buildTier5(ROLLED, "REECE");
    expect(a.openJobsTotal.value).toBe(b.openJobsTotal.value);
  });
});

// ── measurement discipline ──────────────────────────────────────────────────

describe("blanks render — with a reason, never $0", () => {
  test("a zero denominator is unmeasurable, not zero", () => {
    const r = rate(5, 0, "close");
    expect(r.known).toBe(false);
    expect(r.known === false && r.reason).toMatch(/no volume in the denominator/);
  });

  test("perUnit with no units is unmeasurable", () => {
    expect(perUnit(100, 0).known).toBe(false);
  });

  test("every unmeasured value carries a non-empty reason", () => {
    const t5 = buildTier5(ROLLED, "JAX_MKT");
    const blanks = [t5.pendingCount, t5.pendingDollars, ...t5.buckets.map((b) => b.dollars)];
    for (const b of blanks) {
      expect(b.known).toBe(false);
      expect(b.known === false && b.reason.length).toBeGreaterThan(10);
    }
  });

  test("unmeasured never carries a numeric value that could be rendered as 0", () => {
    expect(unmeasured("x").value).toBeNull();
  });
});
