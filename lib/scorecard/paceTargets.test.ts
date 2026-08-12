import { describe, expect, it } from "vitest";
import {
  targetTotals,
  perDayTargets,
  sumPerDayTargets,
  sumTargetTotals,
  perDayActual,
  prorateGoal,
} from "./paceTargets";

describe("targetTotals — the net-per-issued-appointment chain", () => {
  it("issued = goal ÷ net$/issued appt, demos = issued × demo%, closed = goal ÷ avg sale", () => {
    const t = targetTotals({ periodGoal: 1_000_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70});
    expect(t.issued).toBeCloseTo(250);
    expect(t.demoed).toBeCloseTo(175);
    expect(t.closed).toBeCloseTo(50);
  });

  it("null/zero rate or avg sale yields null, never NaN/Infinity", () => {
    const t = targetTotals({ periodGoal: 1_000_000, nsli: 0, avgSale: null, targetDemoPct: 70});
    expect(t.leads).toBeNull(); // no issues → no leads
    expect(t.issued).toBeNull();
    expect(t.demoed).toBeNull();
    expect(t.closed).toBeNull();
  });

  it("leads-needed is ALWAYS null — the grain bridge is unproven (§6, §13)", () => {
    // Not "null when the issue rate is missing". Null unconditionally, on a
    // fully-populated chain, because issues ÷ issue-rate divides an
    // APPOINTMENT-grain count by a LEAD-grain rate. There is no input that
    // makes this measurable, which is the difference between deferred and
    // merely absent.
    const t = targetTotals({ periodGoal: 1_000_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70 });
    expect(t.leads).toBeNull();
    // …and the rest of the chain is unaffected.
    expect(t.issued).toBeCloseTo(250);
    expect(t.demoed).toBeCloseTo(175);
    expect(t.closed).toBeCloseTo(50);
  });

  it("no issue rate is computed anywhere in the repo", () => {
    // The guard that keeps this deferred rather than quietly re-derived. A
    // `TargetChainInput` with an `issueRate` field would not typecheck; this
    // catches the looser version — someone reintroducing the ratio inline.
    expect(Object.keys(targetTotals({ periodGoal: 1, nsli: 1, avgSale: 1, targetDemoPct: 1 }))).toEqual([
      "leads",
      "issued",
      "demoed",
      "closed",
    ]);
  });
});

describe("per-day targets and company additivity (handoff tests 8 + 22)", () => {
  const officeA = perDayTargets(
    targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70}),
    26,
  );
  const officeB = perDayTargets(
    targetTotals({ periodGoal: 1_040_000, nsli: 5200, avgSale: 26_000, targetDemoPct: 60}),
    26,
  );

  it("office per-day = totals ÷ period selling days (0.1 rounding)", () => {
    // leadsPerDay follows leads: null, because the grain bridge is unproven.
    expect(officeA.leadsPerDay).toBeNull();
    expect(officeA.issuedPerDay).toBe(5);
    expect(officeA.demoedPerDay).toBe(3.5);
    expect(officeA.closedPerDay).toBe(1);
  });

  it("company per-day targets are the EXACT sum of the office per-day targets (test 22)", () => {
    const company = sumPerDayTargets([officeA, officeB]);
    expect(company.leadsPerDay).toBeCloseTo(officeA.leadsPerDay! + officeB.leadsPerDay!, 10);
    expect(company.issuedPerDay).toBeCloseTo(officeA.issuedPerDay! + officeB.issuedPerDay!, 10);
    expect(company.demoedPerDay).toBeCloseTo(officeA.demoedPerDay! + officeB.demoedPerDay!, 10);
    expect(company.closedPerDay).toBeCloseTo(officeA.closedPerDay! + officeB.closedPerDay!, 10);
  });

  it("an office with no rate history is skipped, not NaN'd", () => {
    const empty = perDayTargets(
      targetTotals({ periodGoal: 100_000, nsli: null, avgSale: null, targetDemoPct: 70}),
      26,
    );
    const company = sumPerDayTargets([officeA, empty]);
    expect(company.leadsPerDay).toBe(officeA.leadsPerDay);
    expect(company.issuedPerDay).toBe(officeA.issuedPerDay);
    const none = sumPerDayTargets([empty]);
    expect(none.leadsPerDay).toBeNull();
    expect(none.issuedPerDay).toBeNull();
  });

  it("every office contributes to every metric except leads, which nobody has", () => {
    const noLeadsHistory = perDayTargets(
      targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70}),
      26,
    );
    const company = sumPerDayTargets([officeA, noLeadsHistory]);
    expect(company.leadsPerDay).toBe(officeA.leadsPerDay); // null office skipped
    expect(company.issuedPerDay).toBeCloseTo(officeA.issuedPerDay! + noLeadsHistory.issuedPerDay!, 10);
  });

  it("company totals sum offices null-safely", () => {
    const totals = sumTargetTotals([
      targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70}),
      targetTotals({ periodGoal: 100_000, nsli: null, avgSale: null, targetDemoPct: 70}),
    ]);
    // Σ of nulls is null — a leads total is not resurrected by summing offices.
    expect(totals.leads).toBeNull();
    expect(totals.issued).toBeCloseTo(130);
    expect(totals.closed).toBeCloseTo(26);
  });

  it("0 period selling days yields null per-day targets", () => {
    const t = perDayTargets(
      targetTotals({ periodGoal: 520_000, nsli: 4000, avgSale: 20_000, targetDemoPct: 70}),
      0,
    );
    expect(t.leadsPerDay).toBeNull();
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
