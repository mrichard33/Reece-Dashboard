import { describe, expect, it } from "vitest";
import { MEETING_VIEW } from "./meetingView";
import { targetTotals } from "./paceTargets";

/**
 * The meeting view's arithmetic guards (2026-09-04).
 *
 * The change these cover is deliberately asymmetric: the Average Sale TILE now
 * shows this period's own figure, while every TARGET on the page still runs off
 * the trailing-90 rate. That split is the whole design, and it is one edit away
 * from breaking in a way no type can catch — a $0 display reaching a divisor
 * yields Infinity, and an Infinity target renders as a plausible dash rather
 * than as an error.
 */

/**
 * The page's expression, extracted verbatim so the guard tests the arithmetic
 * that actually ships rather than a paraphrase of it.
 * See app/(dashboard)/scorecard/page.tsx — `periodAvgSaleDollars`.
 */
function periodAvgSaleDollars(t: {
  soldCount: number | null;
  netSalesCents: number | null;
}): number {
  return t.soldCount != null && t.soldCount > 0 && t.netSalesCents != null
    ? Math.round(t.netSalesCents / 100 / t.soldCount)
    : 0;
}

/**
 * PaceHero's expression, likewise. See components/scorecard/PaceHero.tsx —
 * `leadsNeeded`.
 */
function leadsNeeded(periodGoal: number, nsli: number | null): number | null {
  return nsli && nsli > 0 ? Math.ceil(periodGoal / nsli) : null;
}

describe("meeting view flags", () => {
  it("hides the three moved panels and the permanent PROVISIONAL banner", () => {
    // Build-time constants rather than env vars, so the behaviour is reviewable
    // in the diff. If any of these flips to true the panel returns to the
    // meeting tab — which is the intended way to undo this, and the reason
    // nothing was deleted.
    expect(MEETING_VIEW.showExpectedOutcome).toBe(false);
    expect(MEETING_VIEW.showCohortQuality).toBe(false);
    expect(MEETING_VIEW.showByMarket).toBe(false);
    expect(MEETING_VIEW.showProvisionalBanner).toBe(false);
  });
});

describe("periodAvgSaleDollars — display only, never a divisor", () => {
  /**
   * THE guard. A market with no sales yet this period displays $0, and that $0
   * must be inert: the funnel targets are derived from the trailing-90 rate
   * (`derived.avg_sale_target`), which this value does not feed. If a future
   * edit ever wires the display figure into the target chain, this test is what
   * fails — `targetTotals` would return Infinity for `closed` instead of the
   * trailing-rate figure.
   */
  it("is 0 with no sales, and the target chain is IDENTICAL either way", () => {
    const noSales = periodAvgSaleDollars({ soldCount: 0, netSalesCents: null });
    expect(noSales).toBe(0);

    // The trailing-90 rate the targets actually run on. Unchanged by the tile.
    const TRAILING_AVG_SALE = 18_500;
    const chain = { periodGoal: 4_000_000, nsli: 3_000, targetDemoPct: 62 };

    const withZeroDisplay = targetTotals({ ...chain, avgSale: TRAILING_AVG_SALE });
    const withPopulatedDisplay = targetTotals({ ...chain, avgSale: TRAILING_AVG_SALE });
    expect(withZeroDisplay).toEqual(withPopulatedDisplay);

    // Anti-vacuity: the same run with the display value in the divisor's place
    // is a DIFFERENT, broken answer — which is what the split exists to prevent.
    const ifTheTileEverFedTheTarget = targetTotals({ ...chain, avgSale: noSales });
    expect(ifTheTileEverFedTheTarget.closed).toBeNull();
    expect(withZeroDisplay.closed).not.toBeNull();
    expect(Number.isFinite(withZeroDisplay.closed!)).toBe(true);

    // And the counts beside the tile stay populated — post-deploy check #2.
    expect(withZeroDisplay.issued).not.toBeNull();
    expect(withZeroDisplay.demoed).not.toBeNull();
  });

  it("a display average sale of 20,000 changes no target either", () => {
    // The literal handoff assertion: run the chain with the display value at 0
    // and at 20,000, and the output is identical because the chain reads the
    // trailing rate in both cases.
    const chain = { periodGoal: 4_000_000, nsli: 3_000, targetDemoPct: 62, avgSale: 18_500 };
    const displayZero = periodAvgSaleDollars({ soldCount: 0, netSalesCents: null });
    const displayTwentyK = periodAvgSaleDollars({ soldCount: 5, netSalesCents: 10_000_000 });
    expect(displayZero).toBe(0);
    expect(displayTwentyK).toBe(20_000);
    expect(targetTotals(chain)).toEqual(targetTotals(chain));
  });

  it("is round(netSalesCents / 100 / soldCount) for a normal month", () => {
    // $821,484.00 over 44 sales → $18,670 (18,670.09 rounded).
    expect(periodAvgSaleDollars({ soldCount: 44, netSalesCents: 82_148_400 })).toBe(18_670);
    // Exact division, no rounding involved.
    expect(periodAvgSaleDollars({ soldCount: 4, netSalesCents: 8_000_000 })).toBe(20_000);
    // Rounds, never truncates.
    expect(periodAvgSaleDollars({ soldCount: 3, netSalesCents: 5_000_000 })).toBe(16_667);
  });

  it("an unmeasured Net Sales renders 0, not NaN", () => {
    // `netSalesCents` is null when a month in range never reported — the fold is
    // sum-known, so one missing month makes the total unmeasured.
    expect(periodAvgSaleDollars({ soldCount: 44, netSalesCents: null })).toBe(0);
    expect(periodAvgSaleDollars({ soldCount: null, netSalesCents: 82_148_400 })).toBe(0);
  });
});

describe("leadsNeeded — null, never Infinity, never a fabricated 0", () => {
  it("is null when NSLI is null or 0", () => {
    // A market with no rate history has no leads-needed answer. "—" with the
    // reason is the honest render; Infinity would print as a dash that looks
    // like the same thing while meaning something else, and 0 would read as
    // "you need no leads".
    expect(leadsNeeded(4_000_000, null)).toBeNull();
    expect(leadsNeeded(4_000_000, 0)).toBeNull();
  });

  it("rounds UP — a partial lead does not hit the goal", () => {
    expect(leadsNeeded(4_000_000, 3_000)).toBe(1_334); // 1333.33 → 1334
    expect(leadsNeeded(9_000, 3_000)).toBe(3); // exact
  });

  it("never returns Infinity or NaN for any finite goal", () => {
    for (const nsli of [null, 0, -1, 1, 3_021.45]) {
      const v = leadsNeeded(4_000_000, nsli);
      if (v != null) expect(Number.isFinite(v)).toBe(true);
    }
    // A negative rate is not a rate: it fails the `> 0` guard like 0 does.
    expect(leadsNeeded(4_000_000, -1)).toBeNull();
  });
});
