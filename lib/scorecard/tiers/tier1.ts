/**
 * TIER 1 — The Number.  Basis: RTP milestone date.  Source: `jobs_by_milestone`.
 *
 * The owners' five-second read: one row per market plus company, and five
 * columns — Goal · Actual · Pace · Projected Finish · Variance. Nothing else.
 *
 * No funnel metrics, no rates, no leakage. Every one of those has its own tier
 * and every one of them, placed here, costs the five-second read. Resist adding
 * anything: the value of this tier is exactly what it refuses to show.
 */
import { prorateGoal } from "@/lib/scorecard/paceTargets";
import { SCORECARD_MARKETS, marketLabel } from "@/lib/scorecard/markets";
import { measured, unmeasured, type Measured, type TierMeta } from "./types";
import { dollarsOf, forMarket, pickSnapshot, sumMetric, type RolledFact } from "./factRollup";

export type Tier1Row = {
  market: string;
  label: string;
  isCompany: boolean;
  /** Full-period goal $ — company is Σ offices, derived on read, never stored. */
  goal: Measured;
  /** Net released $ on the RTP basis. */
  actual: Measured;
  /** Where the goal says we should be today: goal × elapsed ÷ selling days. */
  pace: Measured;
  /** Run-rate finish: actual ÷ elapsed × selling days. */
  projected: Measured;
  /** Projected finish − goal. Negative = finishing short. */
  variance: Measured;
  /** Actual − pace, the to-date gap. Drives row tone. */
  toDateGap: Measured;
};

export type Tier1 = {
  meta: TierMeta;
  rows: Tier1Row[];
  company: Tier1Row;
  elapsedSellingDays: number;
  totalSellingDays: number;
  /**
   * True when too little of the period has elapsed for a run-rate projection to
   * mean anything (< 20% of selling days). Two days out of twenty-six is not a
   * signal; presenting it as one is what trains leadership to ignore the page.
   */
  lowConfidence: boolean;
  asOf: string | null;
};

/** One office's stored goal, keyed by warehouse market code. */
export type GoalByMarket = Record<string, number | null>;

const NO_GOAL = "no goal set for this market";
const NO_ACTUAL = "no RTP milestone rows for this period";

function buildRow(
  market: string,
  isCompany: boolean,
  goalDollars: number | null,
  actualDollars: number | null,
  elapsed: number,
  sellingDays: number,
): Tier1Row {
  const goal = goalDollars == null || goalDollars <= 0 ? unmeasured(NO_GOAL) : measured(goalDollars);
  const actual = actualDollars == null ? unmeasured(NO_ACTUAL) : measured(actualDollars);

  const paceRaw = goal.known ? prorateGoal(goal.value, elapsed, sellingDays) : null;
  const pace =
    paceRaw == null
      ? unmeasured(goal.known ? "no completed selling days yet in this period" : NO_GOAL)
      : measured(Math.round(paceRaw));

  const projected =
    actual.known && elapsed > 0 && sellingDays > 0
      ? measured(Math.round((actual.value / elapsed) * sellingDays))
      : unmeasured(
          !actual.known ? NO_ACTUAL : "no completed selling days yet — nothing to project from",
        );

  const variance =
    projected.known && goal.known
      ? measured(Math.round(projected.value - goal.value))
      : unmeasured(!goal.known ? NO_GOAL : "projection not computable");

  const toDateGap =
    actual.known && pace.known
      ? measured(Math.round(actual.value - pace.value))
      : unmeasured(!actual.known ? NO_ACTUAL : "pace not computable");

  return {
    market,
    label: isCompany ? "All Markets" : marketLabel(market),
    isCompany,
    goal,
    actual,
    pace,
    projected,
    variance,
    toDateGap,
  };
}

/**
 * Build Tier 1 from rolled facts + stored goals.
 *
 * The company row is the Σ of the office rows — goal AND actual — so the table
 * foots by construction. A stored REECE goal row is deliberately ignored
 * (standing ruling: company goal is derived on read); if the two ever diverge,
 * the office rows are the truth and the page shows their sum.
 */
export function buildTier1(
  rolled: readonly RolledFact[],
  goals: GoalByMarket,
  opts: { elapsedSellingDays: number; totalSellingDays: number; periodLabel: string },
): Tier1 {
  const snap = pickSnapshot(rolled, "jobs_by_milestone", "mtd");
  const asOf = snap[0]?.as_of_date ?? null;

  const rows = SCORECARD_MARKETS.map((m) => {
    // Orlando's goal is ORL + LAKE; its actual is likewise the sum of both
    // source rows (the rollup already collapsed LAKE_MKT into ORL_MKT).
    const goalDollars = m.sources.reduce<number | null>((acc, src) => {
      const g = goals[src];
      return g == null ? acc : (acc ?? 0) + g;
    }, null);
    const net = sumMetric(forMarket(snap, m.code), "net_sales");
    return buildRow(
      m.code,
      false,
      goalDollars,
      net.seen ? (dollarsOf(net.cents) ?? 0) : null,
      opts.elapsedSellingDays,
      opts.totalSellingDays,
    );
  });

  const sumKnown = (pick: (r: Tier1Row) => Measured): number | null => {
    let total: number | null = null;
    for (const r of rows) {
      const m = pick(r);
      if (m.known) total = (total ?? 0) + m.value;
    }
    return total;
  };

  const company = buildRow(
    "REECE",
    true,
    sumKnown((r) => r.goal),
    sumKnown((r) => r.actual),
    opts.elapsedSellingDays,
    opts.totalSellingDays,
  );

  return {
    meta: {
      tier: 1,
      title: "The Number",
      question: "Are we going to make the month?",
      basis: "rtp_milestone",
      basisDetail: `${opts.periodLabel}${asOf ? ` · as of ${asOf}` : ""}`,
      source: "Jobs by Milestone Date (RTP)",
    },
    rows,
    company,
    elapsedSellingDays: opts.elapsedSellingDays,
    totalSellingDays: opts.totalSellingDays,
    lowConfidence:
      opts.totalSellingDays > 0 && opts.elapsedSellingDays / opts.totalSellingDays < 0.2,
    asOf,
  };
}
