import {
  getScorecardForPeriod,
  computeBaselineFromRows,
  type BaselineRow,
} from "@/lib/queries/scorecard";
import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * By-Market rollup for the scorecard ⑤ table. For the default month-to-date
 * (snapshot) view this runs as THREE batched queries — all markets' latest
 * snapshot, all goals, all growth-baseline rows — and derives each market's goal
 * in-memory, instead of fanning out ~4 queries per market (the old path opened
 * ~40 concurrent queries, which is what made the page fragile). The goal math is
 * identical to lib/queries/scorecard (effective monthly goal × elapsed ÷ working
 * days), reusing the same baseline resolver. Aggregate / recompute periods keep the
 * per-market path (each call is wrapped so a bad market can never take down the page).
 */

const MARKETS: { code: string; label: string; utility?: boolean }[] = [
  { code: "STPET_MKT", label: "St. Petersburg" },
  { code: "ORL_MKT", label: "Orlando" },
  { code: "FTMYR_MKT", label: "Fort Myers" },
  { code: "JAX_MKT", label: "Jacksonville" },
  { code: "SAR_MKT", label: "Sarasota" },
  { code: "FTLAU_MKT", label: "Fort Lauderdale" },
  { code: "LAKE_MKT", label: "Lakeland" },
  { code: "UNASSIGNED", label: "Unassigned", utility: true },
  { code: "OUT_OF_AREA", label: "Out of Area", utility: true },
];

const ALL_CODES = ["REECE", ...MARKETS.map((m) => m.code)];

export type ByMarketRow = {
  market: string;
  label: string;
  utility: boolean;
  leads: number;
  issued: number;
  demos: number;
  sales: number;
  close_pct: number | null;
  gross_sales: number;
  net_sales: number;
  /** Prorated (to-date) goal for the period, if the market has a goal. */
  goal: number | null;
  /** Net as a % of the prorated goal, 0+ (null when no goal). */
  pctToGoal: number | null;
};

export type ByMarketView = { rows: ByMarketRow[]; total: ByMarketRow | null };

const numOr0 = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** A scorecard_goals row (only the fields the goal math needs). */
type GoalRow = {
  market: string;
  goal_mode: "dollars" | "growth_pct";
  monthly_goal_dollars: unknown;
  growth_pct: unknown;
  working_days: unknown;
};

/** Prorated to-date goal $ for a market — mirrors derive() in lib/queries/scorecard. */
function mtdGoalFor(
  actualsRow: Record<string, unknown>,
  goalRow: GoalRow | undefined,
  baselineRows: BaselineRow[],
  periodStart: string,
): number | null {
  if (!goalRow) return null;
  const growth = numOrNull(goalRow.growth_pct);
  const effective =
    goalRow.goal_mode === "growth_pct" && growth != null
      ? Math.round(computeBaselineFromRows(baselineRows, periodStart).value * (1 + growth / 100))
      : numOr0(goalRow.monthly_goal_dollars);
  const wd = numOrNull(actualsRow.working_days_in_period) ?? numOr0(goalRow.working_days) ?? 1;
  const elapsed = numOr0(actualsRow.days_elapsed) || 1;
  return Math.round(effective * (elapsed / (wd || 1)));
}

function rowFromActuals(
  market: string,
  label: string,
  utility: boolean,
  a: Record<string, unknown>,
  goal: number | null,
): ByMarketRow {
  // Net = released to production (RTP), matching the ① hero and the Net Report basis;
  // falls back to net_sales only for rows predating the released split.
  const net = numOr0(a.released_dollars ?? a.net_sales);
  const g = utility ? null : goal && goal > 0 ? goal : null;
  return {
    market,
    label,
    utility,
    leads: numOr0(a.leads),
    issued: numOr0(a.issued),
    demos: numOr0(a.demos),
    sales: numOr0(a.sales),
    close_pct: numOrNull(a.close_pct),
    gross_sales: numOr0(a.gross_sales),
    net_sales: net,
    goal: g,
    pctToGoal: g ? Math.round((net / g) * 1000) / 10 : null,
  };
}

/** Batched rollup for the snapshot (MTD) view — 3 queries, no per-market fan-out. */
async function getByMarketSnapshot(resolved: ResolvedPeriod): Promise<ByMarketView> {
  const sb = await lpServer();
  const periodStart = resolved.periodStart;

  const [{ data: actualsRows }, { data: goalRows }, { data: baseRows }] = await Promise.all([
    // Every market's snapshots for this period; we keep the latest as_of per market.
    sb
      .from("lp_market_scorecard_daily")
      .select("*")
      .in("market", ALL_CODES)
      .eq("period_start", periodStart)
      .lte("as_of_date", resolved.asOf)
      .order("as_of_date", { ascending: false }),
    sb
      .from("scorecard_goals")
      .select("market, goal_mode, monthly_goal_dollars, growth_pct, working_days")
      .in("market", ALL_CODES),
    // Prior-period rows for the growth baselines (latest-first for the pure resolver).
    sb
      .from("lp_market_scorecard_daily")
      .select("market, net_sales, period_start, as_of_date")
      .in("market", ALL_CODES)
      .lt("period_start", periodStart)
      .order("period_start", { ascending: false })
      .order("as_of_date", { ascending: false })
      .limit(1000),
  ]);

  // Latest snapshot per market (rows are as_of desc).
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of (actualsRows ?? []) as Record<string, unknown>[]) {
    if (!latest.has(String(r.market))) latest.set(String(r.market), r);
  }
  const goals = new Map<string, GoalRow>();
  for (const g of (goalRows ?? []) as GoalRow[]) goals.set(g.market, g);
  const baseByMarket = new Map<string, BaselineRow[]>();
  for (const r of (baseRows ?? []) as (BaselineRow & { market: string })[]) {
    const list = baseByMarket.get(r.market);
    if (list) list.push(r);
    else baseByMarket.set(r.market, [r]);
  }

  const buildRow = (code: string, label: string, utility: boolean): ByMarketRow | null => {
    const a = latest.get(code);
    if (!a) return null;
    const goal = utility ? null : mtdGoalFor(a, goals.get(code), baseByMarket.get(code) ?? [], periodStart);
    return rowFromActuals(code, label, utility, a, goal);
  };

  const rows: ByMarketRow[] = [];
  for (const m of MARKETS) {
    const row = buildRow(m.code, m.label, !!m.utility);
    if (!row) continue;
    // Utility rows only when they carry activity.
    if (m.utility && row.leads + row.issued + row.demos + row.sales + row.gross_sales === 0) continue;
    rows.push(row);
  }
  rows.sort((x, y) => Number(x.utility) - Number(y.utility) || y.net_sales - x.net_sales);

  const total = buildRow("REECE", "All Markets", false);
  return { rows, total };
}

/** Per-market fetch that never rejects — a bad market must not take down the page. */
async function safeView(market: string, resolved: ResolvedPeriod) {
  try {
    return await getScorecardForPeriod(market, resolved);
  } catch (err) {
    console.error(`[byMarket] ${market} failed:`, (err as Error)?.message ?? err);
    return null;
  }
}

/** Fan-out rollup for aggregate / recompute periods (uncommon; kept for exact parity). */
async function getByMarketFanout(resolved: ResolvedPeriod): Promise<ByMarketView> {
  const [reece, ...marketViews] = await Promise.all([
    safeView("REECE", resolved),
    ...MARKETS.map((m) => safeView(m.code, resolved)),
  ]);

  type V = NonNullable<Awaited<ReturnType<typeof getScorecardForPeriod>>>;
  const toRow = (market: string, label: string, utility: boolean, v: V): ByMarketRow => {
    const a = v.actuals as unknown as Record<string, unknown>;
    const goal = utility ? null : v.derived.mtd_goal_dollars || null;
    return rowFromActuals(market, label, utility, a, goal);
  };

  const rows: ByMarketRow[] = [];
  marketViews.forEach((v, i) => {
    const m = MARKETS[i];
    if (!v || !m) return;
    const row = toRow(m.code, m.label, !!m.utility, v);
    if (m.utility && row.leads + row.issued + row.demos + row.sales + row.gross_sales === 0) return;
    rows.push(row);
  });
  rows.sort((x, y) => Number(x.utility) - Number(y.utility) || y.net_sales - x.net_sales);

  const total = reece ? toRow("REECE", "All Markets", false, reece) : null;
  return { rows, total };
}

export async function getByMarket(resolved: ResolvedPeriod): Promise<ByMarketView> {
  return resolved.source === "snapshot"
    ? getByMarketSnapshot(resolved)
    : getByMarketFanout(resolved);
}
