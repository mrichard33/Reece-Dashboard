import { lpService } from "@/lib/supabase/lp";
import { getBaselineNetSales } from "@/lib/queries/scorecard";
import { OFFICE_SOURCE_CODES } from "@/lib/scorecard/markets";

/**
 * Shared company-goal rollup used by BOTH goal-writing actions
 * (saveScorecardGoals and the goal-distribution commit). Deliberately NOT a
 * "use server" module — these helpers take a service-role client and must
 * never be exposed as client-callable server actions.
 */

/** The office SOURCE codes whose goals roll up into the company (REECE) total —
 *  every warehouse code, so Orlando contributes both its ORL and LAKE goal rows. */
export const OFFICE_CODES = [...OFFICE_SOURCE_CODES];

export type Sb = ReturnType<typeof lpService>;

/** Effective $ goal for one office row (growth mode resolved against its baseline). */
export async function effectiveDollars(
  sb: Sb,
  market: string,
  mode: string | null,
  dollars: unknown,
  growthPct: unknown,
  month: string,
): Promise<number> {
  if (mode === "growth_pct" && growthPct != null) {
    const baseline = await getBaselineNetSales(sb, market, month);
    return Math.round(baseline.value * (1 + Number(growthPct) / 100));
  }
  return Number(dollars) || 0;
}

/**
 * Recompute the company (REECE) goal as the SUM of the offices — both the live
 * editable row and the frozen row for `month` — so the company total always equals
 * the offices and is never independently editable.
 */
export async function rollupCompanyGoal(
  sb: Sb,
  month: string,
  workingDays: number,
  editor: string,
  now: string,
): Promise<string | null> {
  // Live: sum every office's effective goal.
  const { data: liveRows, error: liveReadErr } = await sb
    .from("scorecard_goals")
    .select("market, goal_mode, monthly_goal_dollars, growth_pct")
    .in("market", OFFICE_CODES);
  if (liveReadErr) return liveReadErr.message;

  let liveSum = 0;
  for (const r of liveRows ?? []) {
    liveSum += await effectiveDollars(sb, r.market, r.goal_mode, r.monthly_goal_dollars, r.growth_pct, month);
  }
  const { error: liveWriteErr } = await sb.from("scorecard_goals").upsert(
    { market: "REECE", goal_mode: "dollars", monthly_goal_dollars: Math.round(liveSum), growth_pct: null, updated_by: editor, updated_at: now },
    { onConflict: "market" },
  );
  if (liveWriteErr) return liveWriteErr.message;

  // Frozen: sum every office's effective goal for this month.
  const { data: frozenRows, error: frozenReadErr } = await sb
    .from("scorecard_goals_monthly")
    .select("market, goal_mode, goal_dollars, growth_pct")
    .eq("goal_month", month)
    .in("market", OFFICE_CODES);
  if (frozenReadErr) return frozenReadErr.message;

  let frozenSum = 0;
  for (const r of frozenRows ?? []) {
    frozenSum += await effectiveDollars(sb, r.market, r.goal_mode, r.goal_dollars, r.growth_pct, month);
  }
  const { error: frozenWriteErr } = await sb.from("scorecard_goals_monthly").upsert(
    { market: "REECE", goal_month: month, goal_mode: "dollars", goal_dollars: Math.round(frozenSum), growth_pct: null, working_days: workingDays, updated_by: editor, updated_at: now },
    { onConflict: "market,goal_month" },
  );
  if (frozenWriteErr) return frozenWriteErr.message;

  return null;
}
