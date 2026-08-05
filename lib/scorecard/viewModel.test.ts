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
    period_goal_dollars: 9067081,
    mtd_goal_dollars: 8369613,
    avg_sale_target: 9358,
    rate_window: "trailing_3",
    rate_sample_n: 100,
    rate_anchor_month: "2026-06-01",
    rate_period_scoped: true,
    issue_rate: 0.42,
    sales_target_divergence_pct: null,
    target_leads_per_day: 215.9,
    target_issued_per_day: 90.7,
    target_demoed_per_day: 63.5,
    target_closed_per_day: 19.1,
    actual_leads_per_day: 158.2,
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

  it("shows NSLI and Average Sale as trailing rates (previous running data), not current actuals", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    // NSLI = the calculated trailing NSLI (goals.trailing_nsli), NOT a.nsli (1700).
    expect(vm.pace.nsli).toBe(3843);
    // Average Sale = the calculated trailing net avg sale (avg_sale_target), NOT
    // the current period's net ÷ sales.
    expect(vm.pace.avgSale).toBe(9358);
  });

  it("targets Sold from goal ÷ NET average sale, not demos × close%", () => {
    const vm = buildScorecardVM(makeView(), MONTH);
    const sold = vm.marketing.find((r) => r.metric === "Sold")!;
    // 9,067,081 ÷ 9,358 (avg_sale_target) ≈ 969.
    expect(sold.monthGoal).toBe(String(Math.round(9067081 / 9358)));
  });
});

const YTD: ResolvedPeriod = {
  key: "ytd",
  label: "Year to date",
  periodStart: "2026-01-01",
  periodEnd: "2026-07-11",
  asOf: "2026-07-11",
  isPartial: false,
  source: "aggregate",
};

describe("buildScorecardVM — aggregate (YTD) period-awareness", () => {
  function ytdView(): ScorecardView {
    const v = makeView();
    // Aggregate rows carry the whole-period selling days and Σ-of-months goals.
    v.actuals.period_working_days = 305; // full 2026 selling days
    v.actuals.days_elapsed = 162; // Jan 1 → Jul 11 elapsed
    v.derived.period_goal_dollars = 54_461_538; // Σ Jan–Jul goals (Period Goal)
    v.derived.mtd_goal_dollars = 49_230_769; // Target to Date
    return v;
  }

  it("uses the whole-period selling days, not the anchor month", () => {
    const vm = buildScorecardVM(ytdView(), YTD);
    expect(vm.pace.sellingDays).toBe(305);
    expect(vm.snapshot.sellingDays).toBe(305);
    expect(vm.snapshot.daysElapsed).toBe(162);
    expect(Math.round(vm.pace.elapsedPct)).toBe(53); // 162 / 305
  });

  it("shows the full Period Goal (Σ months), not a single month", () => {
    const vm = buildScorecardVM(ytdView(), YTD);
    expect(vm.pace.monthlyGoal).toBe(54_461_538);
    expect(vm.pace.paceGoal).toBe(49_230_769); // Target to Date
    expect(vm.isSingleMonth).toBe(false);
  });

  it("flags a single-month view", () => {
    expect(buildScorecardVM(makeView(), MONTH).isSingleMonth).toBe(true);
  });

  it("widened rate window is a VISIBLE flag; primary windows are not flagged", () => {
    // Primary windows (rolling_90d live, trailing_3 historical) → no flag.
    expect(buildScorecardVM(makeView(), MONTH).pace.rateWidened).toBe(false); // trailing_3 fixture
    const live = makeView();
    live.derived.rate_window = "rolling_90d";
    expect(buildScorecardVM(live, MONTH).pace.rateWidened).toBe(false);
    // Any widening/fallback → flagged (never a silent substitution).
    for (const w of ["trailing_6", "trailing_12", "company"] as const) {
      const v = makeView();
      v.derived.rate_window = w;
      expect(buildScorecardVM(v, MONTH).pace.rateWidened).toBe(true);
    }
  });

  it("zero/absent NSLI renders '—'-safe values — no NaN/Infinity anywhere in pace", () => {
    const v = makeView();
    v.goals.trailing_nsli = null;
    const vm = buildScorecardVM(v, MONTH);
    expect(vm.pace.nsli).toBe(0); // tile renders "—" for 0
    expect(Number.isFinite(vm.pace.nsli)).toBe(true);
    expect(vm.revenue.trailingNSLI).toBe(0);
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
