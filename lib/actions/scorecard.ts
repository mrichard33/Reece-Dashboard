"use server";

import { revalidatePath } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { GoalSchema } from "@/lib/scorecard/goalSchema";
import { getTrailingRates } from "@/lib/queries/scorecard";
import { rollupCompanyGoal } from "@/lib/actions/goalRollup";
import { firstOfMonthET } from "@/lib/date/sellingDays";

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

/** First-of-month (ET) for today — the default freeze target when none is given.
 *  ET, not UTC: between ~20:00 ET and midnight on a month's last day, UTC has
 *  already rolled into the next month and would freeze the wrong row. */
function firstOfCurrentMonth(): string {
  return firstOfMonthET();
}
