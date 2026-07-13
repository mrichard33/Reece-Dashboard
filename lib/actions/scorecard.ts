"use server";

import { revalidatePath } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { GoalSchema } from "@/lib/scorecard/goalSchema";
import { getBaselineNetSales, getTrailingRates } from "@/lib/queries/scorecard";
import { SCORECARD_MARKETS } from "@/lib/scorecard/markets";

/**
 * Admin-gated editor for the scorecard goal targets. Writes go through the
 * service-role client (RLS grants authenticated SELECT only); the admin check
 * mirrors lib/actions/settings.ts. A successful save revalidates /scorecard so
 * the derived goal columns / pace / variance update immediately.
 *
 * Two invariants enforced here (not just in the UI):
 *   • NSLI is CALCULATED from the market's own actuals, never taken from the client.
 *   • The company (REECE) goal is the SUM of the offices — it is never set directly;
 *     every office save rolls the company goal up (live + this month's frozen row).
 */

export type ScorecardActionResult = { ok: boolean; error?: string };

/** The office codes whose goals roll up into the company (REECE) total. */
const OFFICE_CODES = SCORECARD_MARKETS.map((m) => m.code);

type Sb = ReturnType<typeof lpService>;

export async function saveScorecardGoals(
  input: unknown,
): Promise<ScorecardActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const parsed = GoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid goal values." };
  }

  const { goal_month, ...goal } = parsed.data;

  // The company total is derived from the offices — it can't be edited directly.
  if (goal.market === "REECE") {
    return { ok: false, error: "The company goal is the sum of the offices — edit an office instead." };
  }

  const editor = ctx.executive?.name ?? ctx.email;
  const now = new Date().toISOString();
  const month = goal_month ?? firstOfCurrentMonth();
  const sb = lpService();

  // NSLI is CALCULATED from the market's trailing actuals (min-sample window rule +
  // company fallback); the client value (if any) is ignored. Falls back to the
  // submitted number only if there's no history to compute from at all.
  const nsli = (await getTrailingRates(sb, goal.market, month)).nsli ?? goal.trailing_nsli ?? 0;

  // Live row — the current, editable target for the market (drives today's view).
  const { error: liveErr } = await sb
    .from("scorecard_goals")
    .upsert({ ...goal, trailing_nsli: nsli, updated_by: editor, updated_at: now }, { onConflict: "market" });
  if (liveErr) return { ok: false, error: liveErr.message };

  // Frozen row — the goal in force for this month, so multi-month periods sum the
  // goal that actually applied. scorecard_goals_monthly stores the core goal fields
  // only (no optional funnel targets); monthly_goal_dollars maps to goal_dollars.
  const { error: monthlyErr } = await sb.from("scorecard_goals_monthly").upsert(
    {
      market: goal.market,
      goal_month: month,
      goal_mode: goal.goal_mode,
      goal_dollars: goal.monthly_goal_dollars,
      growth_pct: goal.growth_pct,
      working_days: goal.working_days,
      target_close_pct: goal.target_close_pct,
      target_demo_pct: goal.target_demo_pct,
      target_good_rate_pct: goal.target_good_rate_pct,
      target_ko_pct: goal.target_ko_pct,
      trailing_nsli: nsli,
      updated_by: editor,
      updated_at: now,
    },
    { onConflict: "market,goal_month" },
  );
  if (monthlyErr) return { ok: false, error: monthlyErr.message };

  // Roll the company (REECE) goal up from the offices — live + this month's frozen.
  const rollupErr = await rollupCompanyGoal(sb, month, goal.working_days, editor, now);
  if (rollupErr) return { ok: false, error: rollupErr };

  revalidatePath("/scorecard");
  return { ok: true };
}

/** Effective $ goal for one office row (growth mode resolved against its baseline). */
async function effectiveDollars(
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
async function rollupCompanyGoal(
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

/** First-of-month (UTC) for today — the default freeze target when none is given. */
function firstOfCurrentMonth(): string {
  const d = new Date();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-01`;
}
