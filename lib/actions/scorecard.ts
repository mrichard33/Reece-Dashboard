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

  const { error } = await lpService()
    .from("scorecard_goals")
    .upsert(
      {
        ...parsed.data,
        updated_by: ctx.executive?.name ?? ctx.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "market" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/scorecard");
  return { ok: true };
}
