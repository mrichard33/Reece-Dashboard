import { describe, expect, it } from "vitest";
import {
  targetTotals,
  perDayTargets,
  sumPerDayTargets,
  sumTargetTotals,
  perDayActual,
  prorateGoal,
} from "./paceTargets";

describe("targetTotals — the locked NSLI chain", () => {
  it("issued = goal ÷ NSLI, demos = issued × demo%, closed = goal ÷ avg sale", () => {
    const t = targetTotals({ periodGoal: 1_000_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70 });
    expect(t.issued).toBeCloseTo(250);
    expect(t.demoed).toBeCloseTo(175);
    expect(t.closed).toBeCloseTo(50);
  });

  it("null/zero NSLI or avg sale yields null, never NaN/Infinity", () => {
    const t = targetTotals({ periodGoal: 1_000_000, nsli: 0, avgSale: null, targetDemoPct: 70 });
    expect(t.issued).toBeNull();
    expect(t.demoed).toBeNull();
    expect(t.closed).toBeNull();
  });
});

describe("per-day targets and company additivity (handoff test 8)", () => {
  const officeA = perDayTargets(
    targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70 }),
    26,
  );
  const officeB = perDayTargets(
    targetTotals({ periodGoal: 1_040_000, nsli: 5200, avgSale: 26_000, targetDemoPct: 60 }),
    26,
  );

  it("office per-day = totals ÷ period selling days (0.1 rounding)", () => {
    expect(officeA.issuedPerDay).toBe(5);
    expect(officeA.demoedPerDay).toBe(3.5);
    expect(officeA.closedPerDay).toBe(1);
  });

  it("company per-day targets are the EXACT sum of the office per-day targets", () => {
    const company = sumPerDayTargets([officeA, officeB]);
    expect(company.issuedPerDay).toBeCloseTo(officeA.issuedPerDay! + officeB.issuedPerDay!, 10);
    expect(company.demoedPerDay).toBeCloseTo(officeA.demoedPerDay! + officeB.demoedPerDay!, 10);
    expect(company.closedPerDay).toBeCloseTo(officeA.closedPerDay! + officeB.closedPerDay!, 10);
  });

  it("an office with no NSLI history is skipped, not NaN'd", () => {
    const empty = perDayTargets(
      targetTotals({ periodGoal: 100_000, nsli: null, avgSale: null, targetDemoPct: 70 }),
      26,
    );
    const company = sumPerDayTargets([officeA, empty]);
    expect(company.issuedPerDay).toBe(officeA.issuedPerDay);
    const none = sumPerDayTargets([empty]);
    expect(none.issuedPerDay).toBeNull();
  });

  it("company totals sum offices null-safely", () => {
    const totals = sumTargetTotals([
      targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70 }),
      targetTotals({ periodGoal: 100_000, nsli: null, avgSale: null, targetDemoPct: 70 }),
    ]);
    expect(totals.issued).toBeCloseTo(130);
    expect(totals.closed).toBeCloseTo(26);
  });

  it("0 period selling days yields null per-day targets", () => {
    const t = perDayTargets(
      targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70 }),
      0,
    );
    expect(t.issuedPerDay).toBeNull();
  });
});

describe("perDayActual — completed-day pace (handoff tests 1–2)", () => {
  it("divides by elapsed completed days", () => {
    expect(perDayActual(15, 2)).toBe(7.5);
  });
  it("0 completed days (first of the month) → null, never Infinity", () => {
    expect(perDayActual(15, 0)).toBeNull();
    expect(perDayActual(0, 0)).toBeNull();
  });
});

describe("prorateGoal — the single proration helper", () => {
  it("scales the goal by elapsed ÷ period days", () => {
    expect(prorateGoal(2_600_000, 2, 26)).toBeCloseTo(200_000);
  });
  it("0 elapsed → 0 (nothing expected yet); 0 period days → null", () => {
    expect(prorateGoal(2_600_000, 0, 26)).toBe(0);
    expect(prorateGoal(2_600_000, 5, 0)).toBeNull();
  });
  it("null goal passes through as null", () => {
    expect(prorateGoal(null, 2, 26)).toBeNull();
  });
});
