import { describe, expect, it } from "vitest";
import { buildReportFacts, type ReportFactRow } from "./reportFacts.core";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * §P — a market's constituent LP office rows are summed into ONE market record
 * BEFORE any derived rate, percentage or pacing figure is computed.
 *
 * Fort Lauderdale is not a special case; it is the proof. BOCA, MIAMI and RFED
 * branches all roll into FTLAU_MKT upstream (ruling 2026-08-04), so report 137
 * stamps several branch-grain rows with the same market. Any consumer that
 * takes the FIRST matching row instead of summing them reports one branch's
 * numbers as the market's — which, for the 2026-08 MTD snapshot, means $140,433
 * gross against $0 net.
 *
 * Figures below are the live rows of snapshot
 * 7b76f264-6e2b-4e1c-ab5f-41e3838090bd (9 rows, market-attributed, 0
 * UNRESOLVED), read from lp_report_facts on 2026-08-11:
 *
 *   BOCA   gross $94,415   NSA $85,415  cancelled $0       issued 16  sat  9  sold 2
 *   FTLAU  gross $140,433  NSA $0       cancelled $95,698  issued 20  sat 13  sold 2
 *   MIAMI  gross $0        NSA $0       cancelled $0       issued 11  sat  3  sold 0
 *
 * Financing-denied, working and hold rows were ADDED to this fixture on
 * 2026-08-15 (they exist on every real snapshot — scorecard_rebuild_facts emits
 * the whole metric set per branch). Without them Net Sales is correctly null,
 * which is a different test and is pinned separately below.
 *
 * The market totals are the sums, and they are what the dashboard must render.
 *
 * NOTE for anyone reconciling against the source brief: that document listed
 * BOCA's and FTLAU's per-branch figures the other way round. The per-branch
 * attribution here matches the database; every market-level total is identical
 * either way, so the assertions are unaffected.
 */

const MTD: ResolvedPeriod = {
  key: "month",
  label: "August 2026",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  asOf: "2026-08-10",
  isPartial: true,
  source: "snapshot",
} as ResolvedPeriod;

/** One report-137 fact row at BRANCH grain, stamped with its display market. */
const se = (
  branch: string,
  metric: string,
  value_cents: number | null,
  value_count: number,
): ReportFactRow => ({
  report_type: "sales_efficiency",
  period_start: "2026-08-01",
  period_end: "2026-08-10",
  as_of_date: "2026-08-11",
  market: "FTLAU_MKT",
  branch_code_raw: branch,
  metric,
  bucket: null,
  value_cents,
  value_count,
  scope: "mtd",
});

/** The three FTLAU_MKT branches exactly as the snapshot carries them. */
const FTLAU_ROWS: ReportFactRow[] = [
  se("BOCA", "sold", 9_441_500, 2),
  se("BOCA", "net_sold", 8_541_500, 1),
  se("BOCA", "cancelled", 0, 0),
  se("BOCA", "credit_decline", 0, 0),
  se("BOCA", "working_open", 1_000_000, 1),
  se("BOCA", "hold", 0, 0),
  se("BOCA", "issued", null, 16),
  se("BOCA", "sat", null, 9),

  se("FTLAU", "sold", 14_043_300, 2),
  se("FTLAU", "net_sold", 0, 0),
  se("FTLAU", "cancelled", 9_569_800, 1),
  se("FTLAU", "credit_decline", 1_000_000, 1),
  se("FTLAU", "working_open", 0, 0),
  se("FTLAU", "hold", 500_000, 1),
  se("FTLAU", "issued", null, 20),
  se("FTLAU", "sat", null, 13),

  se("MIAMI", "sold", 0, 0),
  se("MIAMI", "net_sold", 0, 0),
  se("MIAMI", "cancelled", 0, 0),
  se("MIAMI", "credit_decline", 0, 0),
  se("MIAMI", "working_open", 0, 0),
  se("MIAMI", "hold", 0, 0),
  se("MIAMI", "issued", null, 11),
  se("MIAMI", "sat", null, 3),
];

describe("§P — BOCA + FTLAU + MIAMI aggregate into FTLAU_MKT", () => {
  const facts = buildReportFacts(FTLAU_ROWS, MTD, "FTLAU_MKT");

  it("sums gross, cancelled and NSA across all three branches", () => {
    expect(facts.sold).not.toBeNull();
    expect(facts.sold!.grossSoldDollars).toBe(234_848); // 94,415 + 140,433 + 0
    expect(facts.sold!.cancelValueDollars).toBe(95_698); // 0 + 95,698 + 0
    expect(facts.sold!.netAfterCancelsDollars).toBe(85_415); // 85,415 + 0 + 0
  });

  it("sums the counts across all three branches", () => {
    expect(facts.sold!.soldCount).toBe(4); // 2 + 2 + 0
    expect(facts.sold!.cancelCount).toBe(1); // 0 + 1 + 0
  });

  it("does NOT report a single constituent branch as the market", () => {
    // The failure mode this whole section exists to prevent: first-row
    // selection yields $140,433 gross with $0 net — which is what a 5%-of-target
    // Fort Lauderdale row looks like.
    expect(facts.sold!.grossSoldDollars).not.toBe(140_433); // FTLAU alone
    expect(facts.sold!.grossSoldDollars).not.toBe(94_415); // BOCA alone
    expect(facts.sold!.netAfterCancelsDollars).not.toBe(0); // FTLAU alone
  });

  it("computes NET SALES from the SUMMED terms, never per branch", () => {
    // 234,848 − 95,698 cancelled − 10,000 financing denied. Summing each
    // branch's own subtraction happens to agree here, but a rate does not,
    // which the next test pins.
    //
    // ⚠️ This is the §6 contracted Net Sales, NOT LP's NSA ($85,415 above) and
    // NOT the old "gross after cancels" ($139,150), which dropped the financing
    // denied term entirely and landed on no defined metric.
    expect(facts.sold!.netSalesDollars).toBe(129_150);
  });

  it("sums Working + Hold as 'not yet released' — in flight, not lost", () => {
    // 10,000 working + 5,000 hold. This is the whole gap between Net Sales and
    // LP's NSA, and it is shown BESIDE net rather than subtracted from it.
    expect(facts.sold!.notYetReleasedDollars).toBe(15_000);
  });

  it("NET SALES is null when a loss term is unsourced, never gross-minus-what-it-has", () => {
    // Absent is unknown, not zero. Dropping a term inflates Net Sales, which
    // fails in the flattering direction.
    const withoutCd = FTLAU_ROWS.filter((r) => r.metric !== "credit_decline");
    const f = buildReportFacts(withoutCd, MTD, "FTLAU_MKT");
    expect(f.sold!.grossSoldDollars).toBe(234_848);
    expect(f.sold!.netSalesDollars).toBeNull();
  });

  it("derives rates from summed numerator ÷ summed denominator, never one row", () => {
    const s = facts.sold!;
    // Cancellation rate as a share of gross: 95,698 / 234,848 = 40.75%.
    const cancelRate = (s.cancelValueDollars! / s.grossSoldDollars) * 100;
    expect(Math.round(cancelRate * 10) / 10).toBe(40.7);

    // The assertion that fails if any rate is computed from a single row.
    // Per-branch cancellation rates are 0%, 68.1% and 0% (undefined) — the
    // market rate is none of them, and it is NOT their average either.
    const perBranch = [0 / 94_415, 95_698 / 140_433];
    for (const r of perBranch) {
      expect(Math.round(r * 1000) / 10).not.toBe(Math.round(cancelRate * 10) / 10);
    }
    const meanOfRates = ((perBranch[0]! + perBranch[1]!) / 2) * 100;
    expect(Math.round(meanOfRates * 10) / 10).not.toBe(Math.round(cancelRate * 10) / 10);
  });

  it("does not assume a fixed constituent set — RFED may appear or vanish", () => {
    // RFED is present in January's snapshot and absent from August's. Adding it
    // must change the totals by exactly its own contribution, with no branch
    // list to update anywhere.
    const RFED_GROSS_CENTS = 500_000; // $5,000
    const withRfed = buildReportFacts(
      [...FTLAU_ROWS, se("RFED", "sold", RFED_GROSS_CENTS, 1), se("RFED", "cancelled", 0, 0)],
      MTD,
      "FTLAU_MKT",
    );
    expect(withRfed.sold!.grossSoldDollars).toBe(234_848 + 5_000);
    expect(withRfed.sold!.soldCount).toBe(5);
    // And its absence leaves the August figures exactly as asserted above.
    expect(facts.sold!.grossSoldDollars).toBe(234_848);
  });
});

describe("§P — a single-office market is unaffected", () => {
  it("Fort Myers reports its one branch's figures unchanged", () => {
    const rows: ReportFactRow[] = [
      { ...se("FTMYR", "sold", 87_320_800, 32), market: "FTMYR_MKT" },
      { ...se("FTMYR", "net_sold", 34_367_600, 10), market: "FTMYR_MKT" },
      { ...se("FTMYR", "cancelled", 2_844_300, 1), market: "FTMYR_MKT" },
    ];
    const facts = buildReportFacts(rows, MTD, "FTMYR_MKT");
    expect(facts.sold!.grossSoldDollars).toBe(873_208);
    expect(facts.sold!.netAfterCancelsDollars).toBe(343_676);
    expect(facts.sold!.cancelValueDollars).toBe(28_443);
  });
});
