import { describe, expect, test } from "vitest";
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

const ld = (market: string, branch: string | null, count: number): ReportFactRow => ({
  ...base, report_type: "lead_disposition", market, branch_code_raw: branch,
  metric: "leads", value_count: count,
});

/** The real live YTD rows, at their real branch grain (Σ = 78,557). */
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
  ld("OUT_OF_AREA", null, 2),
  // Report 136's company control total — reconciliation ONLY, never a read path.
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
    expect(leads!.leads).toBe(3_181 + 5_427 + 1_608 + 286 + 29); // 10,531
    // The grain trap: any single branch would have been a plausible-looking
    // number. 5,427 (BOCA) is the largest and the likeliest wrong answer.
    expect(leads!.leads).not.toBe(5_427);
  });

  test("company leads read ~78,557 — not an issued-like figure", () => {
    const { leads } = buildReportFacts(LIVE, YTD, "REECE");
    expect(leads!.leads).toBe(78_557);
    // The displayed figure was 15,164 — off by a factor of five and close to
    // the Issued total (15,441). Nothing in that range can be leads.
    expect(leads!.leads).toBeGreaterThan(70_000);
  });

  test("per-office totals sum to the company figure exactly", () => {
    const company = buildReportFacts(LIVE, YTD, "REECE").leads!.leads!;
    const offices = SCORECARD_MARKETS.reduce(
      (a, m) => a + (buildReportFacts(LIVE, YTD, m.code).leads?.leads ?? 0),
      0,
    );
    const unassigned = buildReportFacts(LIVE, YTD, "UNASSIGNED").leads?.leads ?? 0;
    expect(offices + unassigned).toBe(company);
  });

  test("Lakeland carries its own leads, and Orlando's exclude them", () => {
    const orl = buildReportFacts(LIVE, YTD, "ORL_MKT").leads!.leads;
    const lake = buildReportFacts(LIVE, YTD, "LAKE_MKT").leads!.leads;
    expect(orl).toBe(16_527 + 28);
    expect(lake).toBe(2_899 + 28);
    expect(orl).not.toBe(16_527 + 28 + 2_899 + 28); // the old fold
  });
});

describe("§3 — one authoritative source per metric", () => {
  test("leads come from 135; 136 rides along as a reconciliation only", () => {
    const { leads } = buildReportFacts(LIVE, YTD, "REECE");
    expect(leads!.basis).toBe("lead_disposition");
    expect(leads!.leads).toBe(78_557); // 135
    expect(leads!.reconLeads).toBe(78_561); // 136, displayed but never read from
    expect(leads!.leads).not.toBe(leads!.reconLeads);
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
