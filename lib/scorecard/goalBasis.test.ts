import { describe, it, expect } from "vitest";
import {
  assertNetGoalBasis,
  netGoalOrUnmeasured,
  isNetActualMetric,
  GoalBasisError,
  NET_ACTUAL_METRICS,
} from "./goalBasis";
import { targetTotals, perDayTargets, prorateGoal } from "./paceTargets";

describe("goal basis is net, and is enforced rather than assumed", () => {
  it("accepts a net goal", () => {
    expect(() => assertNetGoalBasis("net", "test")).not.toThrow();
  });

  it("accepts null — rows predating goal_basis were all entered as net", () => {
    // The column defaults to 'net' for the same reason. A missing basis is not
    // an unknown basis here; it is the only basis that ever existed.
    expect(() => assertNetGoalBasis(null, "test")).not.toThrow();
    expect(() => assertNetGoalBasis(undefined, "test")).not.toThrow();
  });

  it("REFUSES a gross goal, and says why", () => {
    // THE regression guard for §4. Every actual a goal is compared against in
    // this repo is net; storing a gross goal overstates attainment by the
    // gross-to-net gap and rescales every NSLI-derived funnel target with it.
    expect(() => assertNetGoalBasis("gross", "saveScorecardGoals")).toThrow(GoalBasisError);
    expect(() => assertNetGoalBasis("gross", "saveScorecardGoals")).toThrow(/gross-to-net gap/);
  });

  it("refuses anything else too — the guard is an allowlist, not a gross check", () => {
    expect(() => assertNetGoalBasis("GROSS", "test")).toThrow(GoalBasisError);
    expect(() => assertNetGoalBasis("gsa", "test")).toThrow(GoalBasisError);
    expect(() => assertNetGoalBasis("", "test")).toThrow(GoalBasisError);
  });

  it("names only net metrics as valid goal counterparts", () => {
    for (const m of NET_ACTUAL_METRICS) expect(isNetActualMetric(m)).toBe(true);
    // The three that would be materially wrong, and are one identifier away
    // from the right ones in the same view models.
    for (const m of ["gross_sold", "gross_sales", "gsli"]) {
      expect(isNetActualMetric(m)).toBe(false);
    }
  });
});

describe("netGoalOrUnmeasured — read paths render '—' with a reason, never a wrong number", () => {
  it("passes a net goal through", () => {
    expect(netGoalOrUnmeasured(8_750_000, "net")).toEqual({ known: true, value: 8_750_000 });
  });

  it("refuses to hand back a gross goal as if it were comparable", () => {
    const r = netGoalOrUnmeasured(8_750_000, "gross");
    expect(r.known).toBe(false);
    expect(r.value).toBeNull();
    // `known: false` is the branch that carries `reason` — narrow before reading it.
    if (!r.known) expect(r.reason).toMatch(/gross/);
  });

  it("distinguishes 'no goal set' from 'wrong basis'", () => {
    const none = netGoalOrUnmeasured(null, "net");
    expect(none.known).toBe(false);
    if (!none.known) expect(none.reason).toMatch(/no goal set/);
  });

  it("never returns a silent 0 for a missing goal", () => {
    expect(netGoalOrUnmeasured(null, null).value).toBeNull();
    expect(netGoalOrUnmeasured(undefined, "net").value).toBeNull();
  });
});

describe("§4 identity — target dollars to date == target issues to date × planning NSLI", () => {
  /**
   * The goal and the NSLI it is divided by must be the same currency. If the
   * goal were gross while NSLI stayed net (NSA ÷ NumIssued), this identity would
   * break by exactly the gross-to-net ratio — which is what makes it a basis
   * check and not merely an arithmetic one.
   *
   * It cannot be asserted exactly: perDayTarget rounds to 0.1 and the funnel's
   * goalFor rounds the result to a whole issue. The tolerance below is those two
   * roundings carried through the multiplication, nothing more.
   */
  const cases = [
    { label: "single office, mid-month", periodGoal: 2_600_000, nsli: 8_500, periodDays: 26, elapsed: 11 },
    { label: "company, first week", periodGoal: 11_012_374, nsli: 9_137, periodDays: 26, elapsed: 3 },
    { label: "small market, nearly closed", periodGoal: 138_724, nsli: 7_400, periodDays: 22, elapsed: 21 },
    { label: "multi-month period (YTD)", periodGoal: 54_461_538, nsli: 8_900, periodDays: 179, elapsed: 162 },
  ];

  for (const c of cases) {
    it(c.label, () => {
      // The two sides, each built the way the page builds it.
      const totals = targetTotals({
        periodGoal: c.periodGoal,
        nsli: c.nsli,
        avgSale: null,
        targetDemoPct: 70,
        issueRate: null,
      });
      const perDay = perDayTargets(totals, c.periodDays);

      // viewModel.goalFor: per-day target × elapsed days, rounded to whole issues.
      const targetIssuesToDate = Math.round(perDay.issuedPerDay! * c.elapsed);
      // queries/scorecard.ts: Math.round(prorateGoal(goal, elapsed, periodDays)).
      const targetDollarsToDate = Math.round(
        prorateGoal(c.periodGoal, c.elapsed, c.periodDays)!,
      );

      // 0.05 of an issue per day from perDayTarget's round1, plus 0.5 from the
      // whole-issue rounding, each worth one NSLI in dollars.
      const tolerance = c.nsli * (0.05 * c.elapsed + 0.5);

      expect(Math.abs(targetIssuesToDate * c.nsli - targetDollarsToDate)).toBeLessThanOrEqual(
        tolerance,
      );
    });
  }

  it("breaks when the goal is put on a gross basis — the identity IS the basis check", () => {
    // Same NSLI (net ÷ issued), goal inflated to gross. The identity must fail,
    // or it would not be capable of catching the mistake §4 exists to prevent.
    const GROSS_OVER_NET = 1.25;
    const nsli = 8_500;
    const periodDays = 26;
    const elapsed = 11;
    const netGoal = 2_600_000;

    const grossTotals = targetTotals({
      periodGoal: netGoal * GROSS_OVER_NET,
      nsli,
      avgSale: null,
      targetDemoPct: 70,
      issueRate: null,
    });
    const grossPerDay = perDayTargets(grossTotals, periodDays);
    const issuesToDate = Math.round(grossPerDay.issuedPerDay! * elapsed);

    // Compared against the NET target-to-date the page would still show.
    const netDollarsToDate = Math.round(prorateGoal(netGoal, elapsed, periodDays)!);
    const tolerance = nsli * (0.05 * elapsed + 0.5);

    expect(Math.abs(issuesToDate * nsli - netDollarsToDate)).toBeGreaterThan(tolerance);
  });
});
