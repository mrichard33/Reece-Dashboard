import { describe, it, expect } from "vitest";
import { computeTrailingRates, type RateMonth } from "./scorecard";

/** Build `n` latest-first months each with the given per-month net/issued/sales. */
function months(n: number, net: number, issued: number, sales: number): RateMonth[] {
  return Array.from({ length: n }, (_, i) => ({
    // period_start only needs to be distinct + latest-first; values drive the test.
    period_start: `2026-${String(12 - i).padStart(2, "0")}-01`,
    net,
    issued,
    sales,
  }));
}

const COMPANY = months(3, 6_000_000, 1_500, 300); // ample company-wide sample

describe("computeTrailingRates — window rule + min-sample guard", () => {
  it("uses trailing_3 when the 3-month sales count ≥ 30", () => {
    // 3 months × 20 sales = 60 ≥ 30.
    const m = months(6, 200_000, 60, 20);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_3");
    expect(r.sampleN).toBe(60);
    expect(r.nsli).toBe(Math.round((200_000 * 3) / (60 * 3))); // Σnet ÷ Σissued
    expect(r.avgSale).toBe(Math.round((200_000 * 3) / (20 * 3))); // Σnet ÷ Σsales
  });

  it("widens to trailing_6 when trailing_3 < 30 but trailing_6 ≥ 30", () => {
    // 8 sales/mo → 3-mo = 24 (<30), 6-mo = 48 (≥30).
    const m = months(12, 150_000, 40, 8);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_6");
    expect(r.sampleN).toBe(48);
  });

  it("widens to trailing_12 when 6-mo < 30 but 12-mo ≥ 20", () => {
    // 3 sales/mo → 3-mo = 9, 6-mo = 18 (<30), 12-mo = 36 (≥20).
    const m = months(12, 60_000, 20, 3);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("trailing_12");
    expect(r.sampleN).toBe(36);
  });

  it("falls back to the company-wide rate when even 12 months < 20 contracts", () => {
    // 1 sale/mo → 12-mo = 12 (<20) → company.
    const m = months(12, 20_000, 10, 1);
    const r = computeTrailingRates(m, COMPANY);
    expect(r.window).toBe("company");
    expect(r.sampleN).toBe(900); // company 3-mo sales = 300 × 3 months
    expect(r.avgSale).toBe(Math.round((6_000_000 * 3) / (300 * 3)));
  });

  it("never divides by a window with fewer than 20 contracts (Lakeland-June case)", () => {
    // A single fat month (4 contracts, low avg) must NOT become the divisor.
    const thin: RateMonth[] = [
      { period_start: "2026-06-01", net: 27_532, issued: 30, sales: 4 },
      { period_start: "2026-05-01", net: 190_000, issued: 40, sales: 10 },
      { period_start: "2026-04-01", net: 200_000, issued: 42, sales: 11 },
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
    expect(r.sampleN).toBe(0);
  });
});
