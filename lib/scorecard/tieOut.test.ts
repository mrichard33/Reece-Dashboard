import { describe, it, expect } from "vitest";
import {
  targetTotals,
  sumTargetTotals,
  perDayTargets,
  planningRates,
  type TargetChainInput,
} from "./paceTargets";

/**
 * RULING 2026-09-18 (Mark): EVERY PAGE TIES OUT ON A CALCULATOR. Anyone who
 * multiplies the numbers on screen must land on the goal on screen.
 *
 * August 2026, company view, was the counter-example that produced the ruling.
 * Three different issued targets sat on one page — the hero tile's goal ÷
 * blended NSLI (3,221), Funnel vs Goal's Σ-of-offices chain (~3,190), and the
 * detail table's own goal ÷ blended NSLI — and the $3,679 blended rate printed
 * beside them multiplied back to $11.74M, about $112K short of the
 * $11,848,251 goal. The blend includes Out of Area, which carries no goal.
 *
 * The fix is not a new target. The per-office chain was always right; what
 * changed is that every DISPLAYED rate is now derived from it (goal ÷ target)
 * rather than measured independently and shown beside it. These tests pin that
 * inversion on August's real inputs, so the arithmetic a manager does in the
 * meeting is the arithmetic the code does.
 */

const GOAL = 11_848_251;
const SELLING_DAYS = 26;

/** August 2026 goals + trailing rates, per office. Demo (sit) % is 70 everywhere. */
const OFFICES: { code: string; goal: number; nsli: number; avgSale: number }[] = [
  { code: "STPET", goal: 2_500_000, nsli: 3956, avgSale: 15_950 },
  { code: "SAR", goal: 2_500_000, nsli: 4313, avgSale: 16_787 },
  { code: "FTMYR", goal: 2_600_000, nsli: 4618, avgSale: 18_813 },
  { code: "JAX", goal: 1_200_000, nsli: 2801, avgSale: 11_392 },
  { code: "LAKE", goal: 1_000_000, nsli: 2520, avgSale: 9194 },
  { code: "FTLAU", goal: 1_000_000, nsli: 2887, avgSale: 16_653 },
  { code: "ORL", goal: 1_048_251, nsli: 4299, avgSale: 15_036 },
];

const chainFor = (o: (typeof OFFICES)[number]): TargetChainInput => ({
  periodGoal: o.goal,
  nsli: o.nsli,
  avgSale: o.avgSale,
  targetDemoPct: 70,
});

const august = () => sumTargetTotals(OFFICES.map((o) => targetTotals(chainFor(o))));

describe("tie-out — August 2026 company view", () => {
  it("the office goals sum to the company goal (the premise of everything below)", () => {
    expect(OFFICES.reduce((a, o) => a + o.goal, 0)).toBe(GOAL);
  });

  it("the displayed NSLI × the issued target = the goal", () => {
    // The tile used to show the blended trailing rate, which is a MEASUREMENT of
    // a different population. The rate shown beside a target has to be the one
    // the target was built from, or the two do not multiply.
    const totals = august();
    const planning = planningRates(totals, GOAL, GOAL);
    expect(planning.nsli! * totals.issued!).toBeCloseTo(GOAL, 2);
  });

  it("the displayed average sale × the sales target = the goal", () => {
    const totals = august();
    const planning = planningRates(totals, GOAL, GOAL);
    expect(planning.avgSale! * totals.closed!).toBeCloseTo(GOAL, 2);
  });

  it("the demos target × Demo → Sale % = the sales target", () => {
    // The row showed a flat 30% target against a sales goal built from the
    // average sale, so demos × the displayed rate never reached it (on the
    // reported live figures, 1,940 × 30% = 582 against a 627 goal).
    //
    // ⚠️ The percentage is NOT a constant to look up. This table's avg sales
    // imply 788 sales over 2,233 demos = 35.3%; the live August company view,
    // whose trailing rates differ slightly from the figures tabulated here,
    // renders 779 / 2,232 = 34.9%. The IDENTITY is the contract — the specific
    // percentage moves with the inputs, every month and every market.
    const totals = august();
    const planning = planningRates(totals, GOAL, GOAL);
    expect((totals.demoed! * planning.demoToSalePct!) / 100).toBeCloseTo(totals.closed!, 2);
    expect(planning.demoToSalePct!).toBeGreaterThan(30); // never the stored flat target
    expect(planning.demoToSalePct!).toBeCloseTo(35.3, 1);
    expect(Math.round(totals.demoed!)).toBe(2233);
    expect(Math.round(totals.closed!)).toBe(788);
  });

  it("the per-day issued target × selling days lands back on the period goal", () => {
    // Per-day is rounded to 0.1 for DISPLAY, so 26 days can drift by at most
    // 0.05 × 26 = 1.3 appointments. Building the total from the rounded per-day
    // (the old order of operations) drifted several times that at company scale.
    const totals = august();
    const perDay = perDayTargets(totals, SELLING_DAYS);
    expect(Math.abs(perDay.issuedPerDay! * SELLING_DAYS - totals.issued!)).toBeLessThanOrEqual(1.3);
  });

  it("the displayed rate is NOT the blended trailing NSLI", () => {
    // Regression guard on the actual defect: $3,679 blended across every market
    // INCLUDING Out of Area, which has no goal and so no place in a goal chain.
    const totals = august();
    const planning = planningRates(totals, GOAL, GOAL);
    expect(planning.nsli!).not.toBeCloseTo(3679, 0);
    expect(3679 * totals.issued!).toBeLessThan(GOAL - 50_000); // ~$112K short
    expect(planning.nsli!).toBeCloseTo(3714, 0);
  });

  it("the issued target is ONE number — the Σ-of-offices chain, not goal ÷ blend", () => {
    const totals = august();
    expect(Math.round(totals.issued!)).toBe(3190);
    // The hero tile's old formula, for contrast — 31 appointments of daylight
    // between two targets on one page.
    expect(Math.ceil(GOAL / 3679)).toBe(3221);
  });

  it("an office with no rate history drops out of BOTH sides, so the ratio stays honest", () => {
    // Partial coverage. Fort Myers has no trailing NSLI: its issued chain is
    // null, so its $2.6M leaves the numerator too. Including the goal dollars
    // of an office that contributes no appointments would inflate the displayed
    // rate and break the tie-out by exactly that office's goal.
    const blind = new Set(["FTMYR"]);
    const totals = sumTargetTotals(
      OFFICES.map((o) => targetTotals({ ...chainFor(o), nsli: blind.has(o.code) ? null : o.nsli })),
    );
    const coveredGoal = OFFICES.filter((o) => !blind.has(o.code)).reduce((a, o) => a + o.goal, 0);
    expect(coveredGoal).toBe(GOAL - 2_600_000);

    const planning = planningRates(totals, coveredGoal, GOAL);
    expect(planning.nsli! * totals.issued!).toBeCloseTo(coveredGoal, 2);
    // The closed chain is untouched by a missing NSLI, so it still ties to the
    // full goal — the two chains have independent coverage.
    expect(planning.avgSale! * totals.closed!).toBeCloseTo(GOAL, 2);
  });

  it("no computable office at all yields null, never a fabricated rate", () => {
    const totals = sumTargetTotals(
      OFFICES.map((o) => targetTotals({ ...chainFor(o), nsli: null, avgSale: null })),
    );
    const planning = planningRates(totals, GOAL, GOAL);
    expect(planning.nsli).toBeNull();
    expect(planning.avgSale).toBeNull();
    expect(planning.demoToSalePct).toBeNull();
  });
});
