"use server";

import { revalidatePath } from "next/cache";
import { lpServer } from "@/lib/supabase/lp";
import { getAccessContext, isApprover } from "@/lib/auth";
import { getFbTuning } from "@/lib/queries/content";
import { pingGroupMe } from "@/lib/notify/groupme";
import { postWebhook } from "@/lib/n8n";
import { REASON_CODES } from "@/components/content/meta";
import type { FbComponent, FbReasonCode } from "@/lib/supabase/types";

export type ActionResult = { ok: boolean; error?: string };

// Generation tuning (regen cap, batch cap, plan horizon) is read per-action via
// getFbTuning() — fb_settings → env → default — so a UI save takes effect without
// a redeploy. (Previously these were module-scope process.env reads.)

function refresh() {
  // Revalidate the whole Content section (calendar, miner, insights, …).
  revalidatePath("/content", "layout");
}

// ── Copy / Image / Video approval ────────────────────────────────

async function approveComponent(
  postId: string,
  which: "copy" | "image" | "video",
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Approvals are limited to executives." };
  if (!(await isApprover(ctx.email)))
    return { ok: false, error: "You are not on the approver list (APPROVER_EMAILS)." };

  const supabase = await lpServer();
  const { data: post, error: readErr } = await supabase
    .from("fb_posts")
    .select("copy_status, image_status, video_status, media_type")
    .eq("id", postId)
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: readErr?.message ?? "Post not found." };

  const p = post as {
    copy_status: string;
    image_status: string;
    video_status: string | null;
    media_type: string;
  };
  const nextCopy = which === "copy" ? "approved" : p.copy_status;
  const nextImage = which === "image" ? "approved" : p.image_status;
  const nextVideo = which === "video" ? "approved" : p.video_status;
  // Required components mirror the DB trigger (0011/0014): a video post gates on copy +
  // video (the image is the seed frame, not a gate); a text post (no image) gates on copy
  // alone; an image post gates on copy + image.
  const allApproved =
    p.media_type === "video"
      ? nextCopy === "approved" && nextVideo === "approved"
      : p.media_type === "text"
        ? nextCopy === "approved"
        : nextCopy === "approved" && nextImage === "approved";

  // The DB trigger fb_sync_post_status() flips overall status to 'approved' when the
  // required components are approved — we only set the component + the name snapshot.
  const update: Record<string, unknown> =
    which === "copy"
      ? { copy_status: "approved" }
      : which === "image"
        ? { image_status: "approved" }
        : { video_status: "approved" };
  if (allApproved) update.approved_by = ctx.executive.name;

  const { error } = await supabase.from("fb_posts").update(update).eq("id", postId);
  if (error) return { ok: false, error: error.message };

  await pingGroupMe(`${ctx.executive.name} approved the ${which} for a Facebook post.`);
  refresh();
  return { ok: true };
}

/**
 * Convert a draft to a text-only post: drops the image (and any video) entirely, after
 * which the post gates on copy approval alone (trigger 0014) and publishes to the Page
 * feed with no media. Not allowed once posted.
 */
export async function makeTextOnly(postId: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };

  const supabase = await lpServer();
  const { data: post, error: readErr } = await supabase
    .from("fb_posts")
    .select("status, media_type")
    .eq("id", postId)
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: readErr?.message ?? "Post not found." };
  const p = post as { status: string; media_type: string };
  if (p.status === "posted") return { ok: false, error: "Already posted — the media can't change." };
  if (p.media_type === "text") return { ok: true };

  const { error } = await supabase
    .from("fb_posts")
    .update({
      media_type: "text",
      image_url: null,
      image_concept: null,
      image_status: "approved", // neutralized — text posts gate on copy alone
      video_concept: null,
      video_url: null,
      video_status: null,
    })
    .eq("id", postId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function approveCopy(postId: string): Promise<ActionResult> {
  return approveComponent(postId, "copy");
}

export async function approveImage(postId: string): Promise<ActionResult> {
  return approveComponent(postId, "image");
}

export async function approveVideo(postId: string): Promise<ActionResult> {
  return approveComponent(postId, "video");
}

// ── Component rejection → feedback log + n8n regeneration ─────────
//
// ┌─ CONTRACT: action ↔ WF3 (fb-regeneration-webhook) ──────────────────────────┐
// │ The Dashboard is the SYSTEM OF RECORD. This action is the authoritative      │
// │ writer of a rejection: it (1) inserts the fb_post_feedback row (snapshotting  │
// │ the rejected copy/image/video), (2) flips the rejected component to           │
// │ 'rejected', (3) increments fb_posts.revision, and (4) sets needs_manual=true  │
// │ once revision >= MAX_REGEN_ATTEMPTS. It THEN fires the WF3 webhook.           │
// │                                                                              │
// │ n8n WF3 CONSUMES this — it must NOT insert feedback again. WF3 reads the      │
// │ latest feedback row, regenerates copy and/or image (reusing a kept image      │
// │ when only copy was rejected), and sets the regenerated component back to      │
// │ 'pending'. If needs_manual is already set, WF3 alerts and stops. Video        │
// │ regeneration wiring is deferred with the video generation branch.            │
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
  if (!(await isApprover(ctx.email)))
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
    .select("post_body, image_url, video_url, revision")
    .eq("id", postId)
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: readErr?.message ?? "Post not found." };
  const p = post as {
    post_body: string | null;
    image_url: string | null;
    video_url: string | null;
    revision: number;
  };

  // 1. Log the rejection (system of record).
  const snapshot =
    component === "image" ? p.image_url : component === "video" ? p.video_url : p.post_body;
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
  const { maxRegenAttempts } = await getFbTuning();
  const nextRevision = (p.revision ?? 0) + 1;
  const needsManual = nextRevision >= maxRegenAttempts;
  const update: Record<string, unknown> = { revision: nextRevision, needs_manual: needsManual };
  if (component === "copy" || component === "both") update.copy_status = "rejected";
  if (component === "image" || component === "both") update.image_status = "rejected";
  if (component === "video") update.video_status = "rejected";
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

// Records the GROUP leg of a post (the Page leg auto-publishes via WF4). The
// target='both' two-leg model is now resolved (0006_fb_publish.sql): WF4 only flips
// status to 'posted' for target='page'; a 'both' post stays 'approved' with
// page_posted_at set after the Page leg, and THIS action records the human Group leg
// and flips the whole row to 'posted'. So this writer must NOT stomp the Page leg's
// permalink — it only sets fb_permalink when a Group permalink is actually provided
// (the Page permalink lives in page_permalink).
export async function markPosted(
  postId: string,
  permalink?: string,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (!(await isApprover(ctx.email)))
    return { ok: false, error: "You are not on the approver list (APPROVER_EMAILS)." };
  const supabase = await lpServer();
  const update: Record<string, unknown> = {
    status: "posted",
    posted_by: ctx.executive.name,
    posted_at: new Date().toISOString(),
  };
  const link = permalink?.trim();
  if (link) update.fb_permalink = link;
  const { error } = await supabase.from("fb_posts").update(update).eq("id", postId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Set or clear the Eastern wall-clock publish time for a post.
 *  time: "HH:MM" (24h) or null = publish on approval. publish_at is derived
 *  by the DB trigger fb_set_publish_at() — never write it from code. */
export async function setPostTime(
  postId: string,
  time: string | null,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { ok: false, error: "Pick a valid time (HH:MM)." };
  }
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_posts")
    .update({ scheduled_time: time })
    .eq("id", postId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ── Reschedule ───────────────────────────────────────────────────
//
// Moves a post to another day by updating fb_posts.scheduled_date. scheduled_date
// is not unique, so multiple posts can share a day without erroring — but the
// nightly generator assumes ~one/day, so we surface a non-blocking warning when
// the target already has a post (ok:true + error message, mirroring generateNow)
// and still move it.
export async function reschedulePost(
  postId: string,
  newDate: string,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: "Pick a valid date." };
  }

  const supabase = await lpServer();

  // Collision check (excludes the post being moved) — informational only.
  const { count } = await supabase
    .from("fb_posts")
    .select("id", { count: "exact", head: true })
    .eq("scheduled_date", newDate)
    .neq("id", postId);

  const { error } = await supabase
    .from("fb_posts")
    .update({ scheduled_date: newDate })
    .eq("id", postId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return {
    ok: true,
    error: (count ?? 0) > 0 ? `Moved — heads up, ${newDate} already has a post.` : undefined,
  };
}

// ── n8n triggers (no-op offline) ─────────────────────────────────

export async function generateNow(
  scheduledDate: string,
  mediaType?: "image" | "text",
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  // media_type overrides WF1's text_share rotation for this one generation: 'text' ships
  // with no image at all; 'image' forces an image even on a text-rotation date.
  const res = await postWebhook("fb-generate-now", {
    scheduled_date: scheduledDate,
    ...(mediaType ? { media_type: mediaType } : {}),
  });
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

// ── Strategist pass (Content Brief) ──────────────────────────────
//
// runStrategist fires the on-demand WF-Strategist (fb-run-strategist), which reads
// dashboard data signals and upserts a Content Brief onto the target date's
// fb_content_plan slot with brief_status='draft'. approveContentBrief flips that to
// 'approved', which is the gate WF1/WF-Batch check before filling the generator
// prompt from the brief (else they use image-only fallbacks). No-op offline.

export async function runStrategist(scheduledDate: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    return { ok: false, error: "Pick a valid date." };
  }
  const res = await postWebhook("fb-run-strategist", { scheduled_date: scheduledDate });
  return { ok: true, error: res.queued ? undefined : "Queued locally — n8n not connected yet." };
}

export async function approveContentBrief(planId: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_content_plan")
    .update({ brief_status: "approved" })
    .eq("id", planId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ── Plan-ahead + capped batch generation (Part 2) ────────────────
//
// planPeriod fires the cheap one-LLM-call planner (WF-Plan upserts fb_content_plan).
// generateBatch fires the capped batch fill (WF-Batch turns planned slots into drafts).
// Both no-op offline like the other n8n triggers. The plan rows they create/consume are
// the system of record; skip/edit below are the local executive edits to a planned slot.

export async function planPeriod(
  startDate: string,
  days?: number,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const { planHorizonDays } = await getFbTuning();
  const horizon = Math.max(1, Math.floor(days ?? planHorizonDays));
  const res = await postWebhook("fb-plan-period", { start_date: startDate, days: horizon });
  return { ok: true, error: res.queued ? undefined : "Queued locally — n8n not connected yet." };
}

export async function generateBatch(max?: number): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  // Clamp to the hard cap so the UI can never request an unbounded run.
  const { maxPerGeneration } = await getFbTuning();
  const n = Math.min(maxPerGeneration, Math.max(1, Math.floor(max ?? maxPerGeneration)));
  const res = await postWebhook("fb-generate-batch", { max: n });
  return { ok: true, error: res.queued ? undefined : "Queued locally — n8n not connected yet." };
}

export async function skipPlanSlot(id: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_content_plan")
    .update({ status: "skipped" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function editPlanSlot(
  id: string,
  fields: { pillar?: string; archetype?: string; subtopic_id?: string | null; campaign?: string | null },
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Limited to executives." };
  const update: Record<string, unknown> = {};
  if (fields.pillar !== undefined) update.pillar = fields.pillar.trim();
  if (fields.archetype !== undefined) update.archetype = fields.archetype.trim();
  if (fields.subtopic_id !== undefined) update.subtopic_id = fields.subtopic_id || null;
  if (fields.campaign !== undefined) update.campaign = fields.campaign?.trim() || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await lpServer();
  const { error } = await supabase.from("fb_content_plan").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
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
