import {
  getScorecardForPeriod,
  computeBaselineFromRows,
  type BaselineRow,
} from "@/lib/queries/scorecard";
import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { prorateGoal } from "@/lib/scorecard/paceTargets";
import {
  SCORECARD_MARKETS,
  UTILITY_MARKETS,
} from "@/lib/scorecard/markets";
import { fetchReportFactRows } from "@/lib/queries/reportFacts";
import { buildReportFacts } from "@/lib/queries/reportFacts.core";

/**
 * By-Market rollup for the scorecard ⑤ table. For the default month-to-date
 * (snapshot) view this runs as THREE batched queries — all markets' latest
 * snapshot, all goals, all growth-baseline rows — and derives each market's goal
 * in-memory, instead of fanning out ~4 queries per market (the old path opened
 * ~40 concurrent queries, which is what made the page fragile). The goal math is
 * identical to lib/queries/scorecard (effective monthly goal × elapsed ÷ working
 * days), reusing the same baseline resolver. Aggregate / recompute periods keep the
 * per-market path (each call is wrapped so a bad market can never take down the page).
 *
 * The market list derives from lib/scorecard/markets (single source of truth):
 * one row per DISPLAY market — a merged market sums its source rows —
 * plus the Unassigned / Out-of-Area utility rows, which must surface visibly
 * whenever they carry activity. The All-Markets total's goal is the Σ of the
 * office rows' goals (derived, never the stored REECE goal row).
 */

const MARKETS: { code: string; label: string; sources: readonly string[]; utility?: boolean }[] = [
  ...SCORECARD_MARKETS.map((m) => ({ code: m.code, label: m.label, sources: m.sources })),
  // Sources, not [code]: UNASSIGNED and OUT_OF_AREA are one display entity
  // (§7 cardinality ruling), so both warehouse codes sum into the single row.
  ...UTILITY_MARKETS.map((m) => ({
    code: m.code,
    label: m.label,
    sources: m.sources as readonly string[],
    utility: true,
  })),
];

const ALL_CODES = ["REECE", ...MARKETS.flatMap((m) => m.sources)];

export type ByMarketRow = {
  market: string;
  label: string;
  utility: boolean;
  /**
   * Leads from report 135 (lead_disposition), summed over the market's
   * branch-grain fact rows. NULL means "not sourced for this period" and MUST
   * render "—" with a reason. It used to read `raw_leads_in` off
   * lp_market_scorecard_daily, which is NULL for every market — coerced through
   * numOr0() that produced a confident 0 leads for every office while the
   * company row showed a non-zero total (§4).
   */
  leads: number | null;
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
  // ── Display-only pace re-expression (no new goal math) ────────────────────
  // `pctToGoal` already divides by the PRORATED goal and `prorateGoal` is
  // linear, so with elapsedFrac = elapsed/workingDays:
  //
  //   pctToGoal   = 100 × net / (periodGoal × elapsedFrac)
  //   achievedPct = 100 × net /  periodGoal              = pctToGoal × elapsedFrac
  //
  // Both fall out of numbers already computed here. The colour bands still read
  // `pctToGoal`; these exist so the card can SAY what that ratio means instead
  // of captioning it "109% goal" on a market holding 25% of its money.
  /** Selling days elapsed as a % of selling days in the period. */
  elapsedPct: number | null;
  /** Net as a % of the FULL-period goal — what "% to goal" sounds like. */
  achievedPct: number | null;
  /** achievedPct − elapsedPct. Same sign as (pctToGoal − 100), always. */
  paceDeltaPts: number | null;
};

export type ByMarketView = { rows: ByMarketRow[]; total: ByMarketRow | null };

/**
 * Does a utility row (UNASSIGNED / OUT_OF_AREA) carry anything worth showing?
 * Includes net_sales: the old count-only check silently dropped a utility row
 * holding only dollars, hiding UNASSIGNED revenue from the table — UNASSIGNED
 * must stay visible so it can be driven to zero (handoff 2026-08-05).
 */
export function rowHasActivity(row: ByMarketRow): boolean {
  return (
    (row.leads ?? 0) + row.issued + row.demos + row.sales + row.gross_sales + row.net_sales !== 0
  );
}

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

/** Prorated to-date goal $ for ONE source market — mirrors derive() in
 *  lib/queries/scorecard via the shared prorateGoal helper. */
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
  const wd = numOrNull(actualsRow.working_days_in_period) ?? numOr0(goalRow.working_days);
  const elapsed = numOr0(actualsRow.days_elapsed);
  const prorated = prorateGoal(effective, elapsed, wd ?? 0);
  return prorated == null ? null : Math.round(prorated);
}

function rowFromActuals(
  market: string,
  label: string,
  utility: boolean,
  a: Record<string, unknown>,
  goal: number | null,
  leads: number | null,
): ByMarketRow {
  // Net = released to production (RTP), matching the ① hero and the Net Report basis;
  // falls back to net_sales only for rows predating the released split.
  const net = numOr0(a.released_dollars ?? a.net_sales);
  const g = utility ? null : goal && goal > 0 ? goal : null;
  const pctToGoal = g ? Math.round((net / g) * 1000) / 10 : null;
  return {
    market,
    label,
    utility,
    ...paceFields(a, pctToGoal),
    // Leads = report 135, passed in by the caller (see ByMarketRow.leads).
    // NEVER a.raw_leads_in — that column is NULL for every market.
    leads,
    issued: numOr0(a.issued),
    demos: numOr0(a.demos),
    sales: numOr0(a.sales),
    close_pct: numOrNull(a.close_pct),
    gross_sales: numOr0(a.gross_sales),
    net_sales: net,
    goal: g,
    pctToGoal,
  };
}

/**
 * The display-only pace re-expression. Separated so the All-Markets row — whose
 * goal is DERIVED as Σ of the offices and therefore recomputes `pctToGoal`
 * after the fact — can reuse the identical derivation instead of a second copy
 * that could drift.
 *
 * `elapsedPct` is a fact about the CALENDAR and survives a missing goal —
 * which matters, because the All-Markets row derives its goal after the fact
 * and would otherwise lose the elapsed figure it needs. `achievedPct` and the
 * delta are null without a goal: a 0% there would read as total failure rather
 * than "not measured".
 */
export function paceFields(
  a: Record<string, unknown>,
  pctToGoal: number | null,
): { elapsedPct: number | null; achievedPct: number | null; paceDeltaPts: number | null } {
  const elapsed = numOr0(a.days_elapsed);
  const wd = numOrNull(a.period_working_days) ?? numOrNull(a.working_days_in_period) ?? 0;
  if (wd <= 0) return { elapsedPct: null, achievedPct: null, paceDeltaPts: null };
  // Derive from the EXACT fraction, not from the rounded percentage — feeding a
  // 0.1-rounded elapsedPct back in compounds two roundings and can push the
  // delta a tenth off the true value on a market far from pace.
  const frac = elapsed / wd;
  return { elapsedPct: Math.round(frac * 1000) / 10, ...achievedCore(pctToGoal, frac) };
}

/**
 * achievedPct = pctToGoal × elapsedFrac — see the ByMarketRow note. Derived,
 * never re-divided, so it cannot disagree with the ratio driving the colour.
 *
 * The delta is computed as `elapsedFrac × (pctToGoal − 100)` rather than as
 * `achievedPct − elapsedPct`. Algebraically identical:
 *
 *     achieved − elapsed = f·p − 100f = f·(p − 100)
 *
 * but this form makes the sign PROPORTIONAL to (pctToGoal − 100) by
 * construction, so it can never contradict the colour band — subtracting two
 * separately-rounded percentages can.
 *
 * It can still round to 0.0 where the band is marginally off 100: at one
 * elapsed day of 26, a market at 99.9% of target is 0.004 points behind. The
 * caption says "on pace", which is true; the bar stays amber, which is also
 * true. Only a NONZERO delta is a claim, and a nonzero delta always agrees.
 */
function achievedCore(
  pctToGoal: number | null,
  frac: number | null,
): { achievedPct: number | null; paceDeltaPts: number | null } {
  if (pctToGoal == null || frac == null) return { achievedPct: null, paceDeltaPts: null };
  return {
    achievedPct: Math.round(pctToGoal * frac * 10) / 10,
    paceDeltaPts: Math.round(frac * (pctToGoal - 100) * 10) / 10,
  };
}

/**
 * Re-derivation for the All-Markets row, whose goal is summed from the offices
 * AFTER the row is built — by then only the rounded `elapsedPct` survives, so
 * this carries a tenth more slack than `paceFields`. Immaterial at display
 * resolution, and the sign is still proportional to (pctToGoal − 100).
 */
export function achievedFrom(
  pctToGoal: number | null,
  elapsedPct: number | null,
): { achievedPct: number | null; paceDeltaPts: number | null } {
  return achievedCore(pctToGoal, elapsedPct == null ? null : elapsedPct / 100);
}

/** Batched rollup for the snapshot (MTD) view — 3 queries, no per-market fan-out. */
async function getByMarketSnapshot(resolved: ResolvedPeriod): Promise<ByMarketView> {
  const sb = await lpServer();
  const periodStart = resolved.periodStart;

  const [{ data: actualsRows }, { data: goalRows }, { data: baseRows }, factRows] = await Promise.all([
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
    // Report 135 leads — fetched ONCE and projected per market in memory.
    fetchReportFactRows(),
  ]);

  // Leads come from report 135 only (§3 authoritative source, §4 repoint).
  const leadsFor = (code: string): number | null =>
    buildReportFacts(factRows, resolved, code).leads?.leads ?? null;

  // Latest snapshot per SOURCE market (rows are as_of desc).
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

  /** Sum a display market's source rows into one pseudo-actuals row. */
  const combinedActuals = (sources: readonly string[]): Record<string, unknown> | null => {
    const found = sources
      .map((s) => latest.get(s))
      .filter((r): r is Record<string, unknown> => !!r);
    if (found.length === 0) return null;
    if (found.length === 1) return found[0] ?? null;
    const sum = (f: string) => found.reduce((a, r) => a + numOr0(r[f]), 0);
    const demos = sum("demos");
    const sales = sum("sales");
    return {
      leads: sum("leads"),
      raw_leads_in: sum("raw_leads_in"),
      issued: sum("issued"),
      demos,
      sales,
      close_pct: demos > 0 ? Math.round((sales / demos) * 1000) / 10 : null,
      gross_sales: sum("gross_sales"),
      released_dollars: found.some((r) => r.released_dollars != null) ? sum("released_dollars") : null,
      net_sales: sum("net_sales"),
      days_elapsed: Math.max(...found.map((r) => numOr0(r.days_elapsed))),
      working_days_in_period: Math.max(...found.map((r) => numOr0(r.working_days_in_period))) || null,
    };
  };

  const buildRow = (
    code: string,
    label: string,
    utility: boolean,
    sources: readonly string[],
  ): ByMarketRow | null => {
    const a = combinedActuals(sources);
    if (!a) return null;
    // Goal = Σ of the source markets' prorated goals.
    let goal: number | null = null;
    if (!utility) {
      for (const src of sources) {
        const g = mtdGoalFor(a, goals.get(src), baseByMarket.get(src) ?? [], periodStart);
        if (g != null) goal = (goal ?? 0) + g;
      }
    }
    return rowFromActuals(code, label, utility, a, goal, leadsFor(code));
  };

  const rows: ByMarketRow[] = [];
  for (const m of MARKETS) {
    const row = buildRow(m.code, m.label, !!m.utility, m.sources);
    if (!row) continue;
    // Utility rows only when they carry activity.
    if (m.utility && !rowHasActivity(row)) continue;
    rows.push(row);
  }
  rows.sort((x, y) => Number(x.utility) - Number(y.utility) || y.net_sales - x.net_sales);

  // The All-Markets row keeps REECE's actuals, but its goal is DERIVED — the Σ of
  // the office rows' goals — so the total always equals the sum of its parts.
  const total = buildRow("REECE", "All Markets", false, ["REECE"]);
  if (total) {
    const officeGoalSum = rows.reduce((a, r) => (r.utility ? a : a + (r.goal ?? 0)), 0);
    total.goal = officeGoalSum > 0 ? officeGoalSum : null;
    total.pctToGoal = total.goal ? Math.round((total.net_sales / total.goal) * 1000) / 10 : null;
    // The derived goal changes the ratio, so the pace statement must follow it.
    // elapsedPct is calendar-only and already correct on the row.
    Object.assign(total, achievedFrom(total.pctToGoal, total.elapsedPct));
  }
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
  const [factRows, reece, ...marketViews] = await Promise.all([
    // Report 135 leads — one fetch, projected per market in memory.
    fetchReportFactRows(),
    safeView("REECE", resolved),
    ...MARKETS.map((m) => safeView(m.code, resolved)),
  ]);

  const leadsFor = (code: string): number | null =>
    buildReportFacts(factRows, resolved, code).leads?.leads ?? null;

  type V = NonNullable<Awaited<ReturnType<typeof getScorecardForPeriod>>>;
  const toRow = (market: string, label: string, utility: boolean, v: V): ByMarketRow => {
    const a = v.actuals as unknown as Record<string, unknown>;
    const goal = utility ? null : v.derived.mtd_goal_dollars || null;
    return rowFromActuals(market, label, utility, a, goal, leadsFor(market));
  };

  const rows: ByMarketRow[] = [];
  marketViews.forEach((v, i) => {
    const m = MARKETS[i];
    if (!v || !m) return;
    const row = toRow(m.code, m.label, !!m.utility, v);
    if (m.utility && !rowHasActivity(row)) return;
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
