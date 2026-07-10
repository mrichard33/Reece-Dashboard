"use server";

import { revalidatePath } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { GoalSchema } from "@/lib/scorecard/goalSchema";

/**
 * Admin-gated editor for the scorecard goal targets. Writes go through the
 * service-role client (RLS grants authenticated SELECT only); the admin check
 * mirrors lib/actions/settings.ts. A successful save revalidates /scorecard so
 * the derived goal columns / pace / variance update immediately.
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
  const editor = ctx.executive?.name ?? ctx.email;
  const now = new Date().toISOString();
  const month = goal_month ?? firstOfCurrentMonth();
  const sb = lpService();

  // Live row — the current, editable target for the market (drives today's view).
  const { error: liveErr } = await sb
    .from("scorecard_goals")
    .upsert({ ...goal, updated_by: editor, updated_at: now }, { onConflict: "market" });
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
      trailing_nsli: goal.trailing_nsli,
      updated_by: editor,
      updated_at: now,
    },
    { onConflict: "market,goal_month" },
  );
  if (monthlyErr) return { ok: false, error: monthlyErr.message };

  revalidatePath("/scorecard");
  return { ok: true };
}

/** First-of-month (UTC) for today — the default freeze target when none is given. */
function firstOfCurrentMonth(): string {
  const d = new Date();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-01`;
}
