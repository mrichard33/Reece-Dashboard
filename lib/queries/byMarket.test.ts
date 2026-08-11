import { describe, expect, it } from "vitest";
import { rowHasActivity, paceFields, achievedFrom, type ByMarketRow } from "./byMarket";

/**
 * Guard for the utility-row suppression rule. The old check summed only
 * counts + gross, so an UNASSIGNED row holding only net dollars was silently
 * dropped from the By-Market table — hiding exactly the line that must stay
 * visible until it's driven to zero (handoff 2026-08-05).
 */

const row = (over: Partial<ByMarketRow>): ByMarketRow => ({
  market: "UNASSIGNED",
  label: "Unassigned",
  utility: true,
  leads: 0,
  issued: 0,
  demos: 0,
  sales: 0,
  close_pct: null,
  gross_sales: 0,
  net_sales: 0,
  goal: null,
  pctToGoal: null,
  elapsedPct: null,
  achievedPct: null,
  paceDeltaPts: null,
  ...over,
});

describe("rowHasActivity", () => {
  it("a truly empty utility row is suppressed", () => {
    expect(rowHasActivity(row({}))).toBe(false);
  });
  it("counts alone surface the row", () => {
    expect(rowHasActivity(row({ leads: 3 }))).toBe(true);
  });
  it("REGRESSION: net dollars alone surface the row (was silently dropped)", () => {
    expect(rowHasActivity(row({ net_sales: 34_400 }))).toBe(true);
  });
  it("gross dollars alone surface the row", () => {
    expect(rowHasActivity(row({ gross_sales: 12_000 }))).toBe(true);
  });
});

// ── §2 — the pace re-expression is derived, not recomputed ─────────────────
//
// `pctToGoal` already divides net by the PRORATED to-date goal, and
// `prorateGoal` is linear, so:
//
//   pctToGoal ≥ 100  ⟺  achievedPct ≥ elapsedPct  ⟺  paceDeltaPts ≥ 0
//
// These tests pin that equivalence. If anyone ever changes the goal math, the
// caption and the colour band would silently start disagreeing — the sentence
// would say "ahead of pace" on a red bar. That is what these catch.

describe("§2 — achieved vs elapsed, derived from the ratio already on screen", () => {
  /** 25% of the goal banked on 23% of the selling days: the brief's example.
   *  6 of 26 selling days = 23.1% elapsed; net 250k of a 1M period goal;
   *  prorated goal = 1M × 6/26 = 230,769 → pctToGoal = 108.3. */
  const actuals = { days_elapsed: 6, working_days_in_period: 26 };

  it("a market at 25% achieved / 23% elapsed reads AHEAD, and its bar is green", () => {
    const pctToGoal = Math.round((250_000 / (1_000_000 * (6 / 26))) * 1000) / 10;
    expect(pctToGoal).toBeGreaterThanOrEqual(100); // the ≥100 green band

    const p = paceFields(actuals, pctToGoal);
    expect(p.elapsedPct).toBeCloseTo(23.1, 1);
    expect(p.achievedPct).toBeCloseTo(25, 1);
    expect(p.paceDeltaPts).toBeGreaterThan(0);
  });

  it("EQUIVALENCE: a nonzero delta never contradicts the colour band", () => {
    // The delta is elapsedFrac × (pctToGoal − 100), so its sign is proportional
    // to the band by construction. It can round to 0.0 when the band is
    // marginally off 100 and barely any of the period has elapsed — at 1 of 26
    // days, 99.9% of target is 0.004 points behind. "On pace" is true there.
    // What must never happen is a delta that points the OTHER way from the bar.
    for (const pctToGoal of [40, 89.9, 90, 99.9, 100, 100.1, 150, 400]) {
      for (const a of [
        { days_elapsed: 1, working_days_in_period: 26 },
        { days_elapsed: 13, working_days_in_period: 26 },
        { days_elapsed: 26, working_days_in_period: 26 },
      ]) {
        const d = paceFields(a, pctToGoal).paceDeltaPts!;
        if (d > 0) expect(pctToGoal).toBeGreaterThan(100);
        if (d < 0) expect(pctToGoal).toBeLessThan(100);
      }
    }
  });

  it("IDENTITY: paceDeltaPts = elapsedFrac × (pctToGoal − 100)", () => {
    // The algebraic content of the whole change, pinned. If the goal math ever
    // stops being linear this fails, which is exactly when the caption would
    // start lying about the bar.
    for (const pctToGoal of [40, 90, 100, 108.3, 150]) {
      for (const days of [1, 6, 13, 26]) {
        const p = paceFields({ days_elapsed: days, working_days_in_period: 26 }, pctToGoal);
        // Stored at 0.1 resolution, so half a step is the exact bound.
        expect(Math.abs(p.paceDeltaPts! - (days / 26) * (pctToGoal - 100))).toBeLessThanOrEqual(0.05001);
        // achievedPct, elapsedPct and the delta are each rounded independently,
        // so their difference can drift by up to a step and a half.
        expect(Math.abs(p.achievedPct! - p.elapsedPct! - p.paceDeltaPts!)).toBeLessThanOrEqual(0.15001);
      }
    }
  });

  it("achievedPct is the goal ratio, NOT the prorated one", () => {
    // The whole point: 108.3% of the MTD target is 25% of the month's money.
    const p = paceFields(actuals, 108.3);
    expect(p.achievedPct).toBeLessThan(30);
    expect(p.achievedPct).not.toBeCloseTo(108.3, 0);
  });

  it("elapsedPct survives a missing goal — the calendar is known regardless", () => {
    // Load-bearing for the All-Markets row, whose goal is derived AFTER the row
    // is built; without this it would lose the elapsed figure it needs.
    const p = paceFields(actuals, null);
    expect(p.elapsedPct).toBeCloseTo(23.1, 1);
    expect(p.achievedPct).toBeNull();
    expect(p.paceDeltaPts).toBeNull();
  });

  it("no goal and no calendar yield nulls, never a fabricated 0%", () => {
    const p = paceFields({ days_elapsed: 0, working_days_in_period: 0 }, null);
    expect(p).toEqual({ elapsedPct: null, achievedPct: null, paceDeltaPts: null });
  });

  it("reads period_working_days first, matching the ① hero's day basis", () => {
    // A multi-month range expands the denominator; using the monthly column
    // would overstate elapsed% on every aggregate view.
    const p = paceFields(
      { days_elapsed: 26, period_working_days: 104, working_days_in_period: 26 },
      100,
    );
    expect(p.elapsedPct).toBeCloseTo(25, 1);
  });

  it("achievedFrom re-derives the All-Markets row after its goal is summed", () => {
    expect(achievedFrom(108.3, 23.1)).toEqual({ achievedPct: 25, paceDeltaPts: 1.9 });
    expect(achievedFrom(null, 23.1)).toEqual({ achievedPct: null, paceDeltaPts: null });
    expect(achievedFrom(108.3, null)).toEqual({ achievedPct: null, paceDeltaPts: null });
  });
});
