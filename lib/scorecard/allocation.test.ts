import { describe, it, expect } from "vitest";
import { largestRemainder, redistributeRemainder, AllocationError } from "./allocation";

/**
 * Handoff tests #27–#30/#32 (pure side): exact-sum largest-remainder
 * correctness, zero-history handling, determinism, and the explicit
 * redistribute-remainder semantics. DB-write behavior (#28 ORL→ORL_MKT row,
 * #31 preview-writes-nothing, #32 distribution_id on rows) lives in the
 * action layer — the pure planner here is what it executes.
 */

const W = (pairs: [string, number][]) => pairs.map(([code, weight]) => ({ code, weight }));

describe("largestRemainder — exact sum in cents (test 27)", () => {
  it("Σ allocations === company goal EXACTLY across ≥20 randomized goals", () => {
    // Deterministic pseudo-random (LCG) — awkward primes, cents-level totals.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const weights = W([
      ["STPET_MKT", 1_234_567],
      ["ORL_MKT", 2_345_679],
      ["FTMYR_MKT", 998_431],
      ["JAX_MKT", 3],
      ["SAR_MKT", 777_777],
      ["FTLAU_MKT", 1_010_101],
    ]);
    for (let k = 0; k < 25; k++) {
      const companyCents = Math.floor(rand() * 900_000_000) + 1; // up to $9M, odd cents
      const out = largestRemainder(companyCents, weights);
      expect(out.reduce((a, r) => a + r.cents, 0)).toBe(companyCents);
      expect(out).toHaveLength(6);
      for (const r of out) expect(Number.isInteger(r.cents)).toBe(true);
    }
  });

  it("splits the classic awkward case exactly ($100.01 three ways)", () => {
    const out = largestRemainder(10_001, W([["A", 1], ["B", 1], ["C", 1]]));
    expect(out.reduce((a, r) => a + r.cents, 0)).toBe(10_001);
    // 3333 floor each + 2 leftover cents to the largest remainders (tie → code order).
    expect(out.map((r) => r.cents).sort((a, b) => b - a)).toEqual([3334, 3334, 3333]);
  });

  it("is deterministic on equal weights (tie-break by code)", () => {
    const a = largestRemainder(10_001, W([["B", 5], ["A", 5], ["C", 5]]));
    const b = largestRemainder(10_001, W([["B", 5], ["A", 5], ["C", 5]]));
    expect(a).toEqual(b);
    // Ties hand extra cents by code order: A, then B.
    expect(a.find((r) => r.code === "A")!.cents).toBe(3334);
    expect(a.find((r) => r.code === "B")!.cents).toBe(3334);
    expect(a.find((r) => r.code === "C")!.cents).toBe(3333);
  });
});

describe("zero-history markets (test 29)", () => {
  it("a zero-weight market gets share 0 / cents 0 without dividing by zero", () => {
    const out = largestRemainder(100_000, W([["A", 300], ["B", 0], ["C", 700]]));
    const b = out.find((r) => r.code === "B")!;
    expect(b.share).toBe(0);
    expect(b.cents).toBe(0);
    expect(Number.isNaN(b.share)).toBe(false);
    expect(out.reduce((a, r) => a + r.cents, 0)).toBe(100_000);
  });

  it("negative weights clamp to zero (a refund month can't go negative)", () => {
    const out = largestRemainder(100_000, W([["A", 500], ["B", -200]]));
    expect(out.find((r) => r.code === "B")!.cents).toBe(0);
    expect(out.find((r) => r.code === "A")!.cents).toBe(100_000);
  });

  it("all-zero weights throw an AllocationError (surfaced, never a silent 0-split)", () => {
    expect(() => largestRemainder(100_000, W([["A", 0], ["B", 0]]))).toThrow(AllocationError);
  });

  it("non-integer or negative company cents throw", () => {
    expect(() => largestRemainder(100.5, W([["A", 1]]))).toThrow(AllocationError);
    expect(() => largestRemainder(-1, W([["A", 1]]))).toThrow(AllocationError);
  });
});

describe("redistributeRemainder — explicit action semantics (test 30)", () => {
  const weights = W([["A", 100], ["B", 200], ["C", 300], ["D", 400]]);

  it("locked overrides are untouched; the remainder lands only on open offices; total stays exact", () => {
    const companyCents = 1_000_000;
    const locked = [{ code: "B", cents: 350_000 }]; // Mark's override
    const out = redistributeRemainder(companyCents, locked, weights);
    // Only A, C, D receive allocations…
    expect(out.map((r) => r.code).sort()).toEqual(["A", "C", "D"]);
    // …summing exactly to what remains after the override.
    expect(out.reduce((a, r) => a + r.cents, 0)).toBe(650_000);
    // Shares follow the ORIGINAL weights among the open offices (100:300:400).
    expect(out.find((r) => r.code === "A")!.cents).toBe(81_250);
    expect(out.find((r) => r.code === "C")!.cents).toBe(243_750);
    expect(out.find((r) => r.code === "D")!.cents).toBe(325_000);
  });

  it("overrides exceeding the company target throw (variance is surfaced, never negative goals)", () => {
    expect(() => redistributeRemainder(100, [{ code: "A", cents: 200 }], weights)).toThrow(AllocationError);
  });

  it("everything locked throws (nothing to redistribute across)", () => {
    const locked = weights.map((w) => ({ code: w.code, cents: 1 }));
    expect(() => redistributeRemainder(1_000, locked, weights)).toThrow(AllocationError);
  });
});
