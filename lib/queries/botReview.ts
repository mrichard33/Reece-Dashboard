/**
 * Bot Review — reads.
 *
 * Reads only, via lpService() (handoff §7). This file NEVER writes a bot table:
 * every write goes through LP MCP so the permission re-check, the change log
 * and the Unsafe alert cannot be skipped. Same principle as the Command
 * Center's queries file.
 *
 * Every query degrades on a missing relation with `needsMigration`, mirroring
 * lib/queries/commandCenter.ts — sql/103 and sql/104 are applied by hand, so
 * this page can legitimately be deployed before the views exist and must say
 * which step is missing rather than rendering an empty screen that looks broken.
 */

import { lpService } from "@/lib/supabase/lp";
import { buildQueuePlan, type QueueFilters } from "@/lib/botReview/core";

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "");
}

export type QueueRow = {
  context_id: number;
  message_type: "reply" | "skip" | "nurture";
  message_ref: string;
  ghl_contact_id: string | null;
  channel: string | null;
  rule_applied: string | null;
  workflow_code: string | null;
  intent_class: string | null;
  buyer_stage: number | null;
  inbound_text: string | null;
  reply_text: string | null;
  skip_reason: string | null;
  generated_at: string;
  sent_at: string | null;
  office: string | null;
  ai_score: number | null;
  replied_at: string | null;
  booked_at: string | null;
  opted_out_at: string | null;
  learned_items_count: number;
  review_count: number;
  consensus_verdict: string | null;
};

export type MyFeedback = {
  id: number;
  message_type: string;
  message_ref: string;
  verdict: string;
  reason_codes: string[];
  better_text: string | null;
  note: string | null;
  gold: boolean;
  counts: boolean;
  created_at: string;
  reviewer_email: string;
};

const QUEUE_COLUMNS =
  "context_id,message_type,message_ref,ghl_contact_id,channel,rule_applied,workflow_code," +
  "intent_class,buyer_stage,inbound_text,reply_text,skip_reason,generated_at,sent_at,office," +
  "ai_score,replied_at,booked_at,opted_out_at,learned_items_count,review_count,consensus_verdict";

export type QueueResult = {
  rows: QueueRow[];
  total: number;
  needsMigration: boolean;
  error: string | null;
};

/**
 * One page of the review queue.
 *
 * The filter → query mapping lives in buildQueuePlan (pure, unit-tested); this
 * function only applies the plan. Keeping them apart is what lets the saved
 * views be tested without a database — a view that silently matches nothing is
 * the failure mode that would otherwise reach production unnoticed.
 */
export async function getQueue(filters: QueueFilters): Promise<QueueResult> {
  const empty: QueueResult = { rows: [], total: 0, needsMigration: false, error: null };
  const plan = buildQueuePlan(filters);

  let q = lpService().from("v_bot_review_queue").select(QUEUE_COLUMNS, { count: "exact" });

  for (const [col, val] of plan.eq) q = q.eq(col, val);
  for (const [col, vals] of plan.in) q = q.in(col, vals);
  for (const col of plan.notNull) q = q.not(col, "is", null);
  for (const col of plan.isNull) q = q.is(col, null);
  for (const [col, val] of plan.lt) q = q.lt(col, val);
  for (const [col, val] of plan.gte) q = q.gte(col, val);
  for (const o of plan.order) q = q.order(o.column, { ascending: o.ascending, nullsFirst: o.nullsFirst });

  const { data, error, count } = await q.range(plan.range[0], plan.range[1]);

  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }
  return {
    rows: (data ?? []) as unknown as QueueRow[],
    total: count ?? 0,
    needsMigration: false,
    error: null,
  };
}

/** One message by context id — the row the review panel renders. */
export async function getContext(contextId: number): Promise<QueueRow | null> {
  const { data, error } = await lpService()
    .from("v_bot_review_queue")
    .select(QUEUE_COLUMNS)
    .eq("context_id", contextId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as QueueRow;
}

/**
 * The thread the review panel shows, straight from the fingerprint's
 * input_snapshot (handoff §7). This is the conversation AS THE BOT SAW IT,
 * which is the only honest thing to score a reply against — the live thread has
 * moved on since, and judging a reply against messages that arrived after it
 * would be unfair to the bot and useless as evidence.
 */
export type ThreadTurn = {
  direction: "inbound" | "outbound" | null;
  channel: string | null;
  body: string | null;
  at: string | null;
};

export async function getThread(contextId: number): Promise<{ turns: ThreadTurn[]; source: "snapshot" | "none" }> {
  const { data, error } = await lpService()
    .from("bot_message_context")
    .select("input_snapshot")
    .eq("id", contextId)
    .maybeSingle();

  if (error || !data?.input_snapshot) return { turns: [], source: "none" };
  const snap = data.input_snapshot as { thread?: ThreadTurn[] };
  const turns = Array.isArray(snap.thread) ? snap.thread : [];
  return { turns, source: turns.length ? "snapshot" : "none" };
}

/** This reviewer's own live verdicts for the rows on screen. */
export async function getMyFeedback(email: string, refs: Array<{ type: string; ref: string }>): Promise<Map<string, MyFeedback>> {
  const out = new Map<string, MyFeedback>();
  if (!refs.length) return out;

  const { data, error } = await lpService()
    .from("v_bot_current_feedback")
    .select("id,message_type,message_ref,verdict,reason_codes,better_text,note,gold,counts,created_at,reviewer_email")
    .ilike("reviewer_email", email)
    .in("message_ref", refs.map((r) => r.ref));

  if (error || !data) return out;
  for (const row of data as unknown as MyFeedback[]) {
    out.set(`${row.message_type}::${row.message_ref}`, row);
  }
  return out;
}

/** The active reason list, for the chips. */
export type Reason = { code: string; label: string; default_lane: string; severity: number; sort: number };

export async function getReasons(): Promise<Reason[]> {
  const { data, error } = await lpService()
    .from("bot_feedback_reasons")
    .select("code,label,default_lane,severity,sort")
    .eq("active", true)
    .order("sort", { ascending: true });
  if (error || !data) return [];
  return data as unknown as Reason[];
}

/** Calibration state for the banner. Null when the reviewer has no reviews yet. */
export type Calibration = {
  reviewer_email: string;
  calibration_done: number;
  agreement: number | null;
  calibrated: boolean;
  calibration_target: number;
  agreement_target: number;
};

export async function getCalibration(email: string): Promise<Calibration | null> {
  const { data, error } = await lpService()
    .from("v_bot_reviewer_agreement")
    .select("reviewer_email,calibration_done,agreement,calibrated,calibration_target,agreement_target")
    .ilike("reviewer_email", email)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as Calibration;
}

/** The header chip: how much is left, and how much of this week is done. */
export async function getHeaderCounts(): Promise<{ toReview: number; reviewedPct: number | null; needsMigration: boolean }> {
  const svc = lpService();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const unreviewed = await svc
    .from("v_bot_review_queue")
    .select("context_id", { count: "exact", head: true })
    .eq("review_count", 0);

  if (unreviewed.error && isMissingRelation(unreviewed.error)) {
    return { toReview: 0, reviewedPct: null, needsMigration: true };
  }

  const [weekTotal, weekReviewed] = await Promise.all([
    svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true }).gte("generated_at", since),
    svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true })
      .gte("generated_at", since).gt("review_count", 0),
  ]);

  const total = weekTotal.count ?? 0;
  return {
    toReview: unreviewed.count ?? 0,
    // No messages this week is not 0% reviewed — it is nothing to report.
    reviewedPct: total > 0 ? Math.round(((weekReviewed.count ?? 0) / total) * 100) : null,
    needsMigration: false,
  };
}

// ─── Scoreboard (Phase 1, basic) ────────────────────────────────────

export type WeeklyRow = {
  et_week: string;
  path: string;
  channel: string;
  sent: number;
  reviewed: number;
  good: number;
  needs_work: number;
  unsafe: number;
  good_rate: number | null;
  issues_per_100: number | null;
  avg_ai_score: number | null;
  reply_rate: number | null;
  booking_rate: number | null;
  optout_rate: number | null;
  enough_data: boolean;
};

export type TopIssue = {
  reason_code: string;
  label: string;
  default_lane: string;
  severity: number;
  this_week: number;
  last_week: number;
  delta: number;
};

export type ScoreboardResult = {
  weeks: WeeklyRow[];
  issues: TopIssue[];
  needsMigration: boolean;
  error: string | null;
};

export async function getScoreboard(): Promise<ScoreboardResult> {
  const empty: ScoreboardResult = { weeks: [], issues: [], needsMigration: false, error: null };
  const svc = lpService();

  // Two ET weeks is all the basic Scoreboard needs: this week's tiles and the
  // week-over-week delta beside each one.
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);

  const [weekly, issues] = await Promise.all([
    svc.from("v_bot_quality_weekly")
      .select("et_week,path,channel,sent,reviewed,good,needs_work,unsafe,good_rate,issues_per_100,avg_ai_score,reply_rate,booking_rate,optout_rate,enough_data")
      .gte("et_week", since)
      .order("et_week", { ascending: false }),
    svc.from("v_bot_top_issues")
      .select("reason_code,label,default_lane,severity,this_week,last_week,delta")
      .order("this_week", { ascending: false }),
  ]);

  if (weekly.error) {
    if (isMissingRelation(weekly.error)) return { ...empty, needsMigration: true };
    return { ...empty, error: weekly.error.message };
  }

  return {
    weeks: (weekly.data ?? []) as unknown as WeeklyRow[],
    issues: (issues.data ?? []) as unknown as TopIssue[],
    needsMigration: false,
    error: null,
  };
}
