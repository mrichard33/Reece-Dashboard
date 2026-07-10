import { describe, it, expect } from "vitest";
import { buildScorecardVM, scMoneyShort, scPts } from "./viewModel";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

const MONTH: ResolvedPeriod = {
  key: "month",
  label: "Jun 2026 (MTD)",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-24",
  asOf: "2026-06-24",
  isPartial: false,
  source: "snapshot",
};

function makeView(overrides?: {
  bucketTally?: ScorecardView["actuals"]["raw_inputs"] extends infer R
    ? R extends { bucket_tally?: infer B }
      ? B
      : never
    : never;
  dropBuckets?: boolean;
}): ScorecardView {
  const actuals: ScorecardView["actuals"] = {
    market: "REECE",
    computed_from: "lp_api",
    as_of_date: "2026-06-24",
    period_start: "2026-06-01",
    period_end: "2026-06-24",
    days_elapsed: 24,
    working_days_in_period: 26,
    leads: 5382,
    issued: 1596,
    sets: 2798,
    demos: 1063,
    sales: 375,
    net_issue: 1511,
    net_close: 290,
    ko_count: 0,
    good_business: 2713755,
    gross_sales: 8931546,
    net_sales: 2713755,
    released_dollars: 2713755,
    working_dollars: 3254023,
    pending_total: null,
    pending_dollars: 0,
    deposits: 0,
    raw_leads_in: 5382,
    pct_issue: 57.0,
    demo_pct: 70.4,
    close_pct: 35.3,
    pct_net_close: 27.3,
    good_rate_pct: 30.4,
    ko_pct: 22.7,
    gsli: 5596,
    nsli: 1700,
    avg_sale: 9358,
    reconciled: false,
    created_at: null,
    raw_inputs: overrides?.dropBuckets
      ? { status_tally: { "Awaiting Product": 65, "HOLD - HOA": 56 }, non_demo_tally: { NOC: 7 } }
      : {
          status_tally: { "Awaiting Product": 65, "HOLD - HOA": 56, Quoted: 39 },
          non_demo_tally: { NOC: 7 },
          bucket_tally: {
            released_dollars: 2713755,
            working_dollars: 3254023,
            other_pending: 1025316,
            cancelled_dollars: 1938452,
          },
        },
  };

  const goals: ScorecardView["goals"] = {
    market: "REECE",
    goal_mode: "dollars",
    monthly_goal_dollars: 9067081,
    growth_pct: null,
    working_days: 26,
    target_close_pct: 30,
    target_good_rate_pct: 70,
    target_demo_pct: 70,
    target_ko_pct: 10,
    trailing_nsli: 3843,
    target_issue_pct: null,
    target_net_close_pct: null,
    updated_by: "Mark Richard",
    updated_at: "2026-06-24T00:00:00.000Z",
  };

  const derived: ScorecardView["derived"] = {
    monthly_goal_dollars: 9067081,
    mtd_goal_dollars: 8369613,
    target_issued_per_day: 90.7,
    target_demoed_per_day: 63.5,
    target_closed_per_day: 19.1,
    actual_issued_per_day: 66.5,
    actual_demoed_per_day: 44.3,
    actual_closed_per_day: 15.6,
    variance: { dollars: 2713755 - 8369613, close_pts: 5.3, demo_pts: 0.4, good_rate_pts: -39.6, ko_pts: 12.7 },
    goal: {
      mode: "dollars",
      growth_pct: null,
      baseline_net_sales: null,
      baseline_source: "none",
      effective_monthly_goal: 9067081,
      estimated: false,
    },
    reconciled: false,
  };

  return { actuals, goals, derived };
}

describe("buildScorecardVM", () => {
  it("computes the pace headline (gauge %, gap, verdict) from real figures", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    expect(vm.abbr).toBe("MTD");
    expect(Math.round(vm.pace.pctOfPace)).toBe(32); // 2,713,755 / 8,369,613
    expect(vm.pace.gap).toBe(2713755 - 8369613); // −5,655,858
    expect(vm.pace.behind).toBe(true);
    expect(vm.pace.tone).toBe("rose");
    expect(vm.pace.verdict).toBe("Behind pace");
  });

  it("derives funnel stage goals as target/day × days elapsed", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    const issued = vm.funnel.find((s) => s.key === "issued")!;
    expect(issued.goal).toBe(Math.round(90.7 * 24)); // 2177
    expect(issued.actual).toBe(1596);
    const set = vm.funnel.find((s) => s.key === "set")!;
    expect(set.goal).toBeNull(); // entry stage, no notch
    const demos = vm.funnel.find((s) => s.key === "demos")!;
    expect(demos.conv).toBeCloseTo((1063 / 1511) * 100, 1); // % Demo uses NET issue
  });

  it("builds the revenue stack and confirms the gross-sales identity", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    const total = vm.revenue.buckets.reduce((s, b) => s + b.value, 0);
    expect(total).toBe(vm.revenue.gross);
    expect(vm.revenue.gross).toBe(8931546);
    expect(vm.revenue.identityOk).toBe(true);
    expect(vm.revenue.workingRev).toBe(3254023 + 1025316);
  });

  it("falls back gracefully when bucket_tally is absent (aggregate periods)", () => {
    const vm = buildScorecardVM(makeView({ dropBuckets: true }), MONTH);
    const released = vm.revenue.buckets.find((b) => b.key === "released")!;
    const working = vm.revenue.buckets.find((b) => b.key === "working")!;
    const cancelled = vm.revenue.buckets.find((b) => b.key === "cancelled")!;
    expect(released.value).toBe(2713755); // released_dollars
    expect(working.value).toBe(3254023); // working_dollars
    expect(cancelled.value).toBeGreaterThanOrEqual(0); // residual, never negative
  });

  it("ranks the top job statuses and lists dropped-from-demos", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    expect(vm.status.items[0]).toEqual({ label: "Awaiting Product", count: 65 });
    expect(vm.status.total).toBe(3);
    expect(vm.status.dropped[0]).toEqual({ label: "NOC", count: 7 });
  });

  it("emits the 16-row Marketing/Sales detail table", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    expect(vm.marketing).toHaveLength(16);
    const netSales = vm.marketing.find((r) => r.metric === "Net Sales (Released)")!;
    expect(netSales.tone).toBe("neg"); // behind the MTD goal
    expect(netSales.warn).toBe(true);
  });
});

describe("formatters", () => {
  it("scMoneyShort renders compact signed money", () => {
    expect(scMoneyShort(5655858)).toBe("$5.66M");
    expect(scMoneyShort(-5655858)).toBe("-$5.66M");
    expect(scMoneyShort(42000)).toBe("$42K");
    expect(scMoneyShort(930)).toBe("$930");
  });

  it("scPts renders a signed point gap with a % suffix", () => {
    expect(scPts(5.3)).toBe("+5.3%");
    expect(scPts(-39.6)).toBe("-39.6%");
  });
});
