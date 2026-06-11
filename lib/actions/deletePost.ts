"use server";

import { revalidatePath } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { getAccessContext, isApprover } from "@/lib/auth";
import { pingGroupMe } from "@/lib/notify/groupme";

type Result = { ok: boolean; error?: string };

/**
 * Hard-delete a Facebook post draft.
 *
 * Unlike skipPost (which keeps the row as status='skipped'), this removes the
 * fb_posts row entirely, deletes its Storage image, and — when no other post
 * remains on that date — flips the matching fb_content_plan slot from
 * 'generated' back to 'planned' so the day can be regenerated.
 *
 * Uses the service-role client so the hard DELETE + Storage removal are not
 * blocked by RLS. Executive + approver gated, since it is destructive.
 */
export async function deletePost(postId: string): Promise<Result> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Deleting is limited to executives." };
  if (!(await isApprover(ctx.email)))
    return { ok: false, error: "You are not on the approver list (APPROVER_EMAILS)." };

  const svc = lpService();

  // Read the row first so we can clean up its image + free its slot afterward.
  const { data: post, error: readErr } = await svc
    .from("fb_posts")
    .select("image_url, scheduled_date")
    .eq("id", postId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!post) return { ok: false, error: "Post not found." };
  const p = post as { image_url: string | null; scheduled_date: string };

  // Hard delete.
  const { error: delErr } = await svc.from("fb_posts").delete().eq("id", postId);
  if (delErr) return { ok: false, error: delErr.message };

  // Best-effort Storage cleanup — an orphaned image is harmless, so never fail on it.
  if (p.image_url && p.image_url.includes("/fb-images/")) {
    const name = p.image_url.split("/fb-images/")[1];
    if (name) {
      try {
        await svc.storage.from("fb-images").remove([name]);
      } catch {
        /* orphaned image is harmless; ignore */
      }
    }
  }

  // Re-open the planned slot when the day is now empty, so it can regenerate.
  const { count } = await svc
    .from("fb_posts")
    .select("id", { count: "exact", head: true })
    .eq("scheduled_date", p.scheduled_date);
  if ((count ?? 0) === 0) {
    await svc
      .from("fb_content_plan")
      .update({ status: "planned" })
      .eq("plan_date", p.scheduled_date)
      .eq("status", "generated");
  }

  await pingGroupMe(
    `${ctx.executive.name} deleted a Facebook post draft for ${p.scheduled_date}.`,
  );
  revalidatePath("/content", "layout");
  return { ok: true };
}
