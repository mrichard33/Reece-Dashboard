import { describe, it, expect } from "vitest";
import { computeTrailingRates, type RateMonth } from "./scorecard";

/** Build `n` latest-first months each with the given per-month net/issued/sales/leads.
 *  rawLeads defaults to `leads` so ratio expectations stay readable; pass
 *  rawLeads explicitly (or null) to exercise the raw-leads rules. */
function months(
  n: number,
  net: number,
  issued: number,
  sales: number,
  leads = 0,
  rawLeads: number | null = leads,
): RateMonth[] {
  return Array.from({ length: n }, (_, i) => ({
    // period_start only needs to be distinct + latest-first; values drive the test.
    period_start: `2026-${String(12 - i).padStart(2, "0")}-01`,
    net,
    issued,
    sales,
    leads,
    rawLeads,
  }));
}

const COMPANY = months(3, 6_000_000, 1_500, 300, 3_000); // ample company-wide sample

describe("computeTrailingRates — window rule + min-sample guard", () => {
  it("uses trailing_3 when the 3-month sales count ≥ 30", () => {
    // 3 months × 20 sales = 60 ≥ 30.
    const m = months(6, 200_000, 60, 20, 120);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_3");
    expect(r.sampleN).toBe(60);
    expect(r.nsli).toBe(Math.round((200_000 * 3) / (60 * 3))); // Σnet ÷ Σissued
    expect(r.avgSale).toBe(Math.round((200_000 * 3) / (20 * 3))); // Σnet ÷ Σsales
  });

  it("widens to trailing_6 when trailing_3 < 30 but trailing_6 ≥ 30", () => {
    // 8 sales/mo → 3-mo = 24 (<30), 6-mo = 48 (≥30).
    const m = months(12, 150_000, 40, 8, 90);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_6");
    expect(r.sampleN).toBe(48);
  });

  it("widens to trailing_12 when 6-mo < 30 but 12-mo ≥ 20", () => {
    // 3 sales/mo → 3-mo = 9, 6-mo = 18 (<30), 12-mo = 36 (≥20).
    const m = months(12, 60_000, 20, 3, 50);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_12");
    expect(r.sampleN).toBe(36);
  });

  it("falls back to the company-wide rate when even 12 months < 20 contracts", () => {
    // 1 sale/mo → 12-mo = 12 (<20) → company.
    const m = months(12, 20_000, 10, 1, 25);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("company");
    expect(r.sampleN).toBe(900); // company 3-mo sales = 300 × 3 months
    expect(r.avgSale).toBe(Math.round((6_000_000 * 3) / (300 * 3)));
  });

  it("never divides by a window with fewer than 20 contracts (Lakeland-June case)", () => {
    // A single fat month (4 contracts, low avg) must NOT become the divisor.
    const thin: RateMonth[] = [
      { period_start: "2026-06-01", net: 27_532, issued: 30, sales: 4, leads: 60 },
      { period_start: "2026-05-01", net: 190_000, issued: 40, sales: 10, leads: 80 },
      { period_start: "2026-04-01", net: 200_000, issued: 42, sales: 11, leads: 84 },
    ]; // 3-mo sales = 25 ≥ 30? no (25 < 30) → widen; only 3 months → 6/12 same 25 (<30, <20? 25≥20) → trailing_12
    const r = computeTrailingRates(thin, COMPANY);
    // 25 ≥ 20 so trailing_12 (all available months) is used, NOT the 4-contract month.
    expect(r.window).toBe("trailing_12");
    expect(r.sampleN).toBe(25);
    expect(r.avgSale).toBe(Math.round((27_532 + 190_000 + 200_000) / 25));
  });

  it("returns nulls when there is no usable data anywhere", () => {
    const r = computeTrailingRates([], []);
    expect(r.window).toBeNull();
    expect(r.nsli).toBeNull();
    expect(r.avgSale).toBeNull();
    expect(r.issueRate).toBeNull();
    expect(r.sampleN).toBe(0);
  });
});

describe("rolling 90-day primary window (live anchor — ruled 2026-08-04, handoff test 9)", () => {
  // Months list is latest-first; with windowStart the primary window is every
  // month whose LAST day is on/after windowStart — the MTD month + the months
  // covering the trailing 90 days.
  const m90: RateMonth[] = [
    { period_start: "2026-08-01", net: 100_000, issued: 30, sales: 12, leads: 90, rawLeads: 180 }, // MTD (partial)
    { period_start: "2026-07-01", net: 400_000, issued: 120, sales: 40, leads: 300, rawLeads: 600 },
    { period_start: "2026-06-01", net: 380_000, issued: 110, sales: 38, leads: 280, rawLeads: 560 },
    { period_start: "2026-05-01", net: 360_000, issued: 100, sales: 36, leads: 260, rawLeads: 520 },
    { period_start: "2026-04-01", net: 999_999, issued: 999, sales: 99, leads: 999, rawLeads: 1998 }, // outside window
  ];

  it("windowStart selects the months overlapping the last 90 days, INCLUDING the MTD month", () => {
    // Window 2026-05-07 → 2026-08-04: May (month-end 5/31 ≥ 5/7), Jun, Jul, Aug-MTD; April is out.
    const r = computeTrailingRates(m90, COMPANY, { windowStart: "2026-05-07" });
    expect(r.window).toBe("rolling_90d");
    const net = 100_000 + 400_000 + 380_000 + 360_000;
    const issued = 30 + 120 + 110 + 100;
    const rawLeads = 180 + 600 + 560 + 520;
    expect(r.sampleN).toBe(12 + 40 + 38 + 36);
    expect(r.nsli).toBe(Math.round(net / issued)); // Σ numerators ÷ Σ denominators
    expect(r.issueRate).toBeCloseTo(issued / rawLeads, 4);
  });

  it("recomputes as the window slides: a later windowStart drops the oldest month", () => {
    const r = computeTrailingRates(m90, COMPANY, { windowStart: "2026-06-03" });
    expect(r.window).toBe("rolling_90d");
    expect(r.sampleN).toBe(12 + 40 + 38); // May's month-end 5/31 < 6/03 → out
  });

  it("differs from the historical (period-scoped) window on the same data — periods reprice independently", () => {
    const live = computeTrailingRates(m90, COMPANY, { windowStart: "2026-05-07" });
    const historical = computeTrailingRates(m90, COMPANY); // trailing_3 of the list head
    expect(historical.window).toBe("trailing_3");
    expect(live.nsli).not.toBe(historical.nsli);
  });

  it("thin 90-day sample widens (VISIBLE via the window flag), never silently substitutes", () => {
    const thin: RateMonth[] = [
      { period_start: "2026-08-01", net: 30_000, issued: 8, sales: 3, leads: 20 },
      { period_start: "2026-07-01", net: 90_000, issued: 25, sales: 9, leads: 60 },
      { period_start: "2026-06-01", net: 85_000, issued: 24, sales: 8, leads: 55 },
      { period_start: "2026-05-01", net: 80_000, issued: 22, sales: 8, leads: 50 },
      { period_start: "2026-04-01", net: 82_000, issued: 23, sales: 8, leads: 52 },
      { period_start: "2026-03-01", net: 84_000, issued: 23, sales: 8, leads: 53 },
    ];
    // 90-day window (Aug MTD + Jul + Jun + May) sales = 28 < 30 → widen to 6 months (44 ≥ 30).
    const r = computeTrailingRates(thin, COMPANY, { windowStart: "2026-05-07" });
    expect(r.window).toBe("trailing_6");
    expect(r.sampleN).toBe(3 + 9 + 8 + 8 + 8 + 8);
  });

  it("Orlando-style summed months keep summed numerators/denominators through the 90-day window", () => {
    // Two sources pre-combined per month (the multi-source path) — the window
    // math must stay Σnet ÷ Σissued, never an average of two rates.
    const combined: RateMonth[] = [
      { period_start: "2026-08-01", net: 120_000 + 30_000, issued: 40 + 10, sales: 14 + 4, leads: 100 + 30 },
      { period_start: "2026-07-01", net: 420_000 + 80_000, issued: 130 + 30, sales: 42 + 10, leads: 320 + 80 },
      { period_start: "2026-06-01", net: 400_000 + 70_000, issued: 120 + 28, sales: 40 + 9, leads: 300 + 70 },
    ];
    const r = computeTrailingRates(combined, COMPANY, { windowStart: "2026-05-07" });
    expect(r.window).toBe("rolling_90d");
    const net = 150_000 + 500_000 + 470_000;
    const issued = 50 + 160 + 148;
    expect(r.nsli).toBe(Math.round(net / issued));
  });
});

describe("issue rate — raw-leads denominator, same window as NSLI, null-safe", () => {
  it("issueRate = Σissued ÷ Σraw_leads_in over the SAME window nsli/avgSale chose", () => {
    const m = months(6, 200_000, 60, 20, 150); // trailing_3; rawLeads = leads = 150
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_3");
    expect(r.issueRate).toBeCloseTo((60 * 3) / (150 * 3), 4); // 0.4
  });

  it("the set-cohort `leads` column is NOT the denominator (ruled 2026-08-05)", () => {
    // rawLeads = 2× the cohort figure — the rate must follow rawLeads.
    const m = months(6, 200_000, 60, 20, 150, 300);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.issueRate).toBeCloseTo((60 * 3) / (300 * 3), 4); // 0.2, not 0.4
  });

  it("months without raw_leads_in (pre-June-2026) are excluded from BOTH sides of the ratio", () => {
    // 2 tracked months + 1 untracked in the trailing_3 window: the untracked
    // month's issued must not inflate the numerator against a smaller denominator.
    const m: RateMonth[] = [
      { period_start: "2026-07-01", net: 200_000, issued: 60, sales: 20, leads: 150, rawLeads: 300 },
      { period_start: "2026-06-01", net: 200_000, issued: 60, sales: 20, leads: 150, rawLeads: 300 },
      { period_start: "2026-05-01", net: 200_000, issued: 999, sales: 20, leads: 150, rawLeads: null },
    ];
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_3");
    expect(r.issueRate).toBeCloseTo(120 / 600, 4); // May's 999 issued excluded
  });

  it("no raw-leads months anywhere in the window → issueRate null, never a silent cohort fallback", () => {
    const m = months(6, 200_000, 60, 20, 150, null); // history predates tracking
    const r = computeTrailingRates(m, COMPANY);
    expect(r.nsli).not.toBeNull(); // NSLI unaffected
    expect(r.issueRate).toBeNull();
  });

  it("moves with the widening: a trailing_6 window prices issue rate over 6 months too", () => {
    const m = months(12, 150_000, 40, 8, 100); // trailing_6
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_6");
    expect(r.issueRate).toBeCloseTo((40 * 6) / (100 * 6), 4);
  });

  it("company fallback carries the COMPANY issue rate (visible via window flag, test 25)", () => {
    const m = months(12, 20_000, 10, 1, 25); // → company
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("company"); // the visible fallback flag
    expect(r.issueRate).toBeCloseTo((1_500 * 3) / (3_000 * 3), 4);
  });

  it("zero leads in the window → issueRate null while nsli stays intact (test 24)", () => {
    const m = months(6, 200_000, 60, 20, 0);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.nsli).toBe(Math.round((200_000 * 3) / (60 * 3)));
    expect(r.issueRate).toBeNull();
    expect(Number.isNaN(r.issueRate as unknown as number)).toBe(false);
  });
});
