import { describe, it, expect } from "vitest";
import {
  assertNetGoalBasis,
  assertNetActualMetric,
  netGoalOrUnmeasured,
  isNetActualMetric,
  GoalBasisError,
  NET_ACTUAL_METRICS,
  NON_GOAL_METRICS,
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
    // this repo is Net Sales; storing a gross goal overstates attainment by the
    // cancellations and financing denials it fails to subtract, and rescales
    // every efficiency-derived funnel target with it.
    expect(() => assertNetGoalBasis("gross", "saveScorecardGoals")).toThrow(GoalBasisError);
    expect(() => assertNetGoalBasis("gross", "saveScorecardGoals")).toThrow(
      /Net Sales/,
    );
    // The error must carry the definition, not just the name — "net" is the
    // word four of the five dollar figures on this page could claim.
    expect(() => assertNetGoalBasis("gross", "saveScorecardGoals")).toThrow(
      /Gross Written − Cancellations − Financing Denied/,
    );
    // And it must say that changing it is a contract decision, not a swap.
    expect(() => assertNetGoalBasis("gross", "saveScorecardGoals")).toThrow(
      /not a number swap/,
    );
  });

  it("refuses anything else too — the guard is an allowlist, not a gross check", () => {
    expect(() => assertNetGoalBasis("GROSS", "test")).toThrow(GoalBasisError);
    expect(() => assertNetGoalBasis("gsa", "test")).toThrow(GoalBasisError);
    expect(() => assertNetGoalBasis("", "test")).toThrow(GoalBasisError);
  });

  it("names only Net Sales metrics as valid goal counterparts", () => {
    for (const m of NET_ACTUAL_METRICS) expect(isNetActualMetric(m)).toBe(true);
    // The three that would be materially wrong, and are one identifier away
    // from the right ones in the same view models.
    for (const m of ["gross_sold", "gross_sales", "gsli"]) {
      expect(isNetActualMetric(m)).toBe(false);
    }
  });

  it("REFUSES RTP — it was allowed before 2026-08-12 and is the reason for this change", () => {
    // `released_dollars` sat in this allowlist until the metric contract was
    // rewritten. RTP is dated by production milestone, so a contract sold in
    // April lands in August; pacing a sales goal against it compares two
    // different cohorts. This assertion is the whole point of the rewrite.
    expect(isNetActualMetric("released_dollars")).toBe(false);
    expect(() => assertNetActualMetric("released_dollars", "paceHero")).toThrow(
      /production milestone/,
    );
  });

  it("REFUSES NSA — the trap, because it also has 'net' in the name", () => {
    // NSA subtracts working and hold on top of cancellations and financing
    // denials, so it lags by months: July 2026 was 50.9% of gross on NSA and
    // 76.3% on Net Sales. It is the QUALITY metric, not the goal basis.
    expect(isNetActualMetric("net_sold")).toBe(false);
    expect(isNetActualMetric("nsa_cents")).toBe(false);
    expect(() => assertNetActualMetric("net_sold", "paceHero")).toThrow(/working/);
  });

  it("REFUSES gross-after-cancels — it omits financing denied", () => {
    // Fort Myers Aug 2026: gross-after-cancels $844,765 vs Net Sales $821,484.
    // $23K apart on one market in one month, and only one is the goal basis.
    expect(isNetActualMetric("gross_after_cancels")).toBe(false);
    expect(() => assertNetActualMetric("gross_after_cancels", "revenueCard")).toThrow(
      /financing denials/,
    );
  });

  it("every refused metric explains itself — an allowlist miss must be diagnosable", () => {
    for (const m of Object.keys(NON_GOAL_METRICS)) {
      expect(isNetActualMetric(m)).toBe(false);
      // The thrown message must name the offending metric AND the right basis.
      expect(() => assertNetActualMetric(m, "ctx")).toThrow(new RegExp(m));
      expect(() => assertNetActualMetric(m, "ctx")).toThrow(/Net Sales/);
    }
    // Anti-vacuity: this loop is worthless if the map is empty or tiny.
    expect(Object.keys(NON_GOAL_METRICS).length).toBeGreaterThanOrEqual(6);
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
    });
    const grossPerDay = perDayTargets(grossTotals, periodDays);
    const issuesToDate = Math.round(grossPerDay.issuedPerDay! * elapsed);

    // Compared against the NET target-to-date the page would still show.
    const netDollarsToDate = Math.round(prorateGoal(netGoal, elapsed, periodDays)!);
    const tolerance = nsli * (0.05 * elapsed + 0.5);

    expect(Math.abs(issuesToDate * nsli - netDollarsToDate)).toBeGreaterThan(tolerance);
  });
});
