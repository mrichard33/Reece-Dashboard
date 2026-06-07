"use server";

import { revalidatePath } from "next/cache";
import { lpServer } from "@/lib/supabase/lp";
import { getAccessContext, isApprover } from "@/lib/auth";
import { pingGroupMe } from "@/lib/notify/groupme";
import { postWebhook } from "@/lib/n8n";
import { REASON_CODES } from "@/components/content/meta";
import type { FbComponent, FbReasonCode } from "@/lib/supabase/types";

export type ActionResult = { ok: boolean; error?: string };

/** Regeneration cap before a slot is flagged for manual authoring (spec §3). */
const MAX_REGEN_ATTEMPTS = Number(process.env.MAX_REGEN_ATTEMPTS ?? "3");

function refresh() {
  // Revalidate the whole Content section (calendar, miner, insights, …).
  revalidatePath("/content", "layout");
}

// ── Copy / Image approval ────────────────────────────────────────

async function approveComponent(
  postId: string,
  which: "copy" | "image",
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Approvals are limited to executives." };
  if (!isApprover(ctx.email))
    return { ok: false, error: "You are not on the approver list (APPROVER_EMAILS)." };

  const supabase = await lpServer();
  const { data: post, error: readErr } = await supabase
    .from("fb_posts")
    .select("copy_status, image_status")
    .eq("id", postId)
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: readErr?.message ?? "Post not found." };

  const p = post as { copy_status: string; image_status: string };
  const nextCopy = which === "copy" ? "approved" : p.copy_status;
  const nextImage = which === "image" ? "approved" : p.image_status;
  const bothApproved = nextCopy === "approved" && nextImage === "approved";

  // The DB trigger fb_sync_post_status() flips overall status to 'approved' when
  // both components are approved — we only set the component + the name snapshot.
  const update: Record<string, unknown> =
    which === "copy" ? { copy_status: "approved" } : { image_status: "approved" };
  if (bothApproved) update.approved_by = ctx.executive.name;

  const { error } = await supabase.from("fb_posts").update(update).eq("id", postId);
  if (error) return { ok: false, error: error.message };

  await pingGroupMe(`${ctx.executive.name} approved the ${which} for a Facebook post.`);
  refresh();
  return { ok: true };
}

export async function approveCopy(postId: string): Promise<ActionResult> {
  return approveComponent(postId, "copy");
}

export async function approveImage(postId: string): Promise<ActionResult> {
  return approveComponent(postId, "image");
}

// ── Component rejection → feedback log + n8n regeneration ─────────
//
// ┌─ CONTRACT: action ↔ WF3 (fb-regeneration-webhook) ──────────────────────────┐
// │ The Dashboard is the SYSTEM OF RECORD. This action is the authoritative      │
// │ writer of a rejection: it (1) inserts the fb_post_feedback row (snapshotting  │
// │ the rejected copy/image), (2) flips the rejected component to 'rejected',     │
// │ (3) increments fb_posts.revision, and (4) sets needs_manual=true once         │
// │ revision >= MAX_REGEN_ATTEMPTS. It THEN fires the WF3 webhook to regenerate.  │
// │                                                                              │
// │ n8n WF3 CONSUMES this — it must NOT insert feedback again. WF3 reads the      │
// │ latest feedback row, regenerates copy and/or image (reusing a kept image      │
// │ when only copy was rejected), and sets the regenerated component back to      │
// │ 'pending'. If needs_manual is already set, WF3 alerts and stops.             │
// │ The mirror of this note lives in n8n/fb-regeneration-webhook.json + README.   │
// └──────────────────────────────────────────────────────────────────────────────┘
export async function rejectComponent(
  postId: string,
  component: FbComponent,
  reasonCode: FbReasonCode,
  reasonText?: string,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Rejections are limited to executives." };
  if (!isApprover(ctx.email))
    return { ok: false, error: "You are not on the approver list (APPROVER_EMAILS)." };

  if (!REASON_CODES.some((r) => r.value === reasonCode)) {
    return { ok: false, error: "Pick a valid reason code." };
  }
  const text = reasonText?.trim() || null;
  if (reasonCode === "other" && !text) {
    return { ok: false, error: "A note is required for the 'other' reason." };
  }

  const supabase = await lpServer();
  const { data: post, error: readErr } = await supabase
    .from("fb_posts")
    .select("post_body, image_url, revision")
    .eq("id", postId)
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: readErr?.message ?? "Post not found." };
  const p = post as { post_body: string | null; image_url: string | null; revision: number };

  // 1. Log the rejection (system of record).
  const snapshot = component === "image" ? p.image_url : p.post_body;
  const { error: fbErr } = await supabase.from("fb_post_feedback").insert({
    post_id: postId,
    component,
    reason_code: reasonCode,
    reason_text: text,
    rejected_snapshot: snapshot,
    rejected_by: ctx.executive.name,
  });
  if (fbErr) return { ok: false, error: fbErr.message };

  // 2. Flip the rejected component(s), bump revision, flag manual at the cap.
  const nextRevision = (p.revision ?? 0) + 1;
  const needsManual = nextRevision >= MAX_REGEN_ATTEMPTS;
  const update: Record<string, unknown> = { revision: nextRevision, needs_manual: needsManual };
  if (component === "copy" || component === "both") update.copy_status = "rejected";
  if (component === "image" || component === "both") update.image_status = "rejected";
  const { error } = await supabase.from("fb_posts").update(update).eq("id", postId);
  if (error) return { ok: false, error: error.message };

  // 3. Hand off to WF3 (no-op offline). WF3 consumes the feedback row written above.
  if (!needsManual) {
    await postWebhook("fb-regenerate", {
      post_id: postId,
      component,
      reason_code: reasonCode,
      reason_text: text,
      rejected_by: ctx.executive.name,
    });
  }

  await pingGroupMe(
    `${ctx.executive.name} rejected the ${component} (${reasonCode})` +
      (needsManual ? " — regen cap hit, needs manual authoring." : "."),
  );
  refresh();
  return { ok: true };
}

// ── Edit / skip / mark posted ────────────────────────────────────

export async function editPost(
  postId: string,
  fields: { post_body?: string; first_comment?: string; image_concept?: string },
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Editing is limited to executives." };
  const update: Record<string, unknown> = {};
  if (fields.post_body !== undefined) update.post_body = fields.post_body;
  if (fields.first_comment !== undefined) update.first_comment = fields.first_comment;
  if (fields.image_concept !== undefined) update.image_concept = fields.image_concept;
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await lpServer();
  const { error } = await supabase.from("fb_posts").update(update).eq("id", postId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function skipPost(postId: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const supabase = await lpServer();
  const { error } = await supabase.from("fb_posts").update({ status: "skipped" }).eq("id", postId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// Records the GROUP leg (the Page leg auto-publishes via WF4). NOTE: see the
// matching "target='both' publish-state" follow-up in n8n/fb-page-publish.json —
// when WF4 is wired live, decide whether a 'both' post should remain 'approved'
// until this Group leg is recorded rather than being flipped to 'posted' by the
// Page leg. For now this marks the whole post 'posted'.
export async function markPosted(
  postId: string,
  permalink?: string,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (!isApprover(ctx.email))
    return { ok: false, error: "You are not on the approver list (APPROVER_EMAILS)." };
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_posts")
    .update({
      status: "posted",
      posted_by: ctx.executive.name,
      posted_at: new Date().toISOString(),
      fb_permalink: permalink?.trim() || null,
    })
    .eq("id", postId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ── n8n triggers (no-op offline) ─────────────────────────────────

export async function generateNow(scheduledDate: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const res = await postWebhook("fb-generate-now", { scheduled_date: scheduledDate });
  return { ok: true, error: res.queued ? undefined : "Queued locally — n8n not connected yet." };
}

export async function runMiner(): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const res = await postWebhook("fb-run-miner", {});
  return { ok: true, error: res.queued ? undefined : "Queued locally — n8n not connected yet." };
}

export async function runStrategicRefresh(): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const res = await postWebhook("fb-strategic-refresh", {});
  return { ok: true, error: res.queued ? undefined : "Queued locally — n8n not connected yet." };
}

// ── Subtopics (Idea Miner) ───────────────────────────────────────

export async function approveSubtopic(id: string): Promise<ActionResult> {
  return setSubtopicStatus(id, "active");
}
export async function rejectSubtopic(id: string): Promise<ActionResult> {
  return setSubtopicStatus(id, "rejected");
}

async function setSubtopicStatus(id: string, status: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const supabase = await lpServer();
  const { error } = await supabase.from("fb_subtopics").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function toggleSubtopicActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  return setSubtopicStatus(id, active ? "active" : "inactive");
}

export async function editAndApproveSubtopic(
  id: string,
  fields: { subtopic: string; pillar: string; answers_question?: string },
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (!fields.subtopic.trim() || !fields.pillar.trim()) {
    return { ok: false, error: "Subtopic and pillar are required." };
  }
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_subtopics")
    .update({
      subtopic: fields.subtopic.trim(),
      pillar: fields.pillar.trim(),
      answers_question: fields.answers_question?.trim() || null,
      status: "active",
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function addSubtopic(fields: {
  subtopic: string;
  pillar: string;
  answers_question?: string;
}): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (!fields.subtopic.trim() || !fields.pillar.trim()) {
    return { ok: false, error: "Subtopic and pillar are required." };
  }
  const supabase = await lpServer();
  const { error } = await supabase.from("fb_subtopics").insert({
    subtopic: fields.subtopic.trim(),
    pillar: fields.pillar.trim(),
    answers_question: fields.answers_question?.trim() || null,
    source: "manual",
    status: "active",
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ── Message Bank / prompts (admin) ───────────────────────────────

export async function saveMessageBank(
  bankId: string,
  variables: unknown,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_message_bank")
    .update({ variables })
    .eq("id", bankId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function savePrompt(promptId: string, body: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  if (!body.trim()) return { ok: false, error: "Prompt body cannot be empty." };
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_messaging_prompts")
    .update({ body })
    .eq("id", promptId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ── Manual Group metrics ─────────────────────────────────────────

export async function enterGroupMetrics(
  postId: string,
  metrics: {
    reactions: number;
    comments: number;
    shares: number;
    impressions: number;
    reach: number;
    link_clicks: number;
  },
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const supabase = await lpServer();
  const { error } = await supabase.from("fb_post_metrics").insert({
    post_id: postId,
    source: "group",
    ...metrics,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
