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
import { buildQueuePlan, PAGE_SIZE, type QueueFilters, type LaneCounts } from "@/lib/botReview/core";

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
  // sql/105 — who the conversation is actually with. Nullable: a GHL contact
  // with no LP lead yet resolves to nothing, and the UI falls back to the
  // market label rather than showing a blank row.
  contact_name: string | null;
  lp_prospect_id: string | null;
  lp_lead_id: string | null;
  contact_city: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  rep_name: string | null;
  // sql/106 — which lane this message is in, whether it has been set aside, and
  // whether anyone has already reviewed it. Nullable so the page still renders
  // against a database where sql/106 has not been applied.
  review_lane: "must_review" | "spot_check" | "none" | null;
  must_review_cause: string | null;
  dismissed: boolean | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
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
  "ai_score,replied_at,booked_at,opted_out_at,learned_items_count,review_count,consensus_verdict," +
  "contact_name,lp_prospect_id,lp_lead_id,contact_city,contact_phone,contact_email,rep_name," +
  "review_lane,must_review_cause,dismissed,dismissed_by,dismissed_at,reviewed_at,reviewed_by";

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
  // `dismissed` is a computed boolean, never null, so `.is()` is the right
  // operator — `.eq("dismissed", false)` on a boolean column works too, but
  // PostgREST spells a boolean comparison `is.` and this keeps them honest.
  for (const [col, val] of plan.is) q = q.is(col, val);
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

/**
 * The count badge on each lane switcher button.
 *
 * Counts OPEN work, not lane membership: a must-review message someone has
 * already scored is done, and leaving it in the badge would mean the number
 * never reaches zero and so never means anything. Same three conditions the
 * lane queries use, so the badge and the list can never disagree.
 *
 * Everything's badge is the whole queue, because that lane is a lookup rather
 * than a to-do list.
 */
export type { LaneCounts } from "@/lib/botReview/core";

export async function getLaneCounts(): Promise<LaneCounts> {
  const svc = lpService();
  const open = (lane: string) =>
    svc
      .from("v_bot_review_queue")
      .select("context_id", { count: "exact", head: true })
      .eq("review_lane", lane)
      .is("dismissed", false)
      .eq("review_count", 0);

  const [must, spot, all] = await Promise.all([
    open("must_review"),
    open("spot_check"),
    svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true }),
  ]);

  // A missing sql/106 reads as zero work, never as an error: the lane switcher
  // renders with empty badges and the Everything lane still lists everything.
  return {
    must_review: must.error ? 0 : (must.count ?? 0),
    spot_check: spot.error ? 0 : (spot.count ?? 0),
    everything: all.error ? 0 : (all.count ?? 0),
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

/**
 * Every bot message to one contact, oldest first.
 *
 * The queue page is 25 messages, so the contact's other messages may well sit
 * on a page the reviewer has not loaded. The conversation is fetched on its
 * own rather than assembled from the rows on screen — otherwise the thread
 * would silently change shape depending on which page you arrived from.
 *
 * Capped at 200: past that it is no longer a conversation a person reads, and
 * an unbounded fetch on a contact the bot has messaged for months would stall
 * the page.
 */
const CONVERSATION_CAP = 200;

export async function getConversation(contactId: string): Promise<QueueRow[]> {
  const { data, error } = await lpService()
    .from("v_bot_review_queue")
    .select(QUEUE_COLUMNS)
    .eq("ghl_contact_id", contactId)
    .order("generated_at", { ascending: true })
    .limit(CONVERSATION_CAP);
  if (error || !data) return [];
  return data as unknown as QueueRow[];
}

/** The captured thread for each message in a conversation, keyed by context id. */
export async function getThreads(contextIds: number[]): Promise<Map<number, ThreadTurn[]>> {
  const out = new Map<number, ThreadTurn[]>();
  if (!contextIds.length) return out;

  const { data, error } = await lpService()
    .from("bot_message_context")
    .select("id,input_snapshot")
    .in("id", contextIds);

  if (error || !data) return out;
  for (const r of data as Array<{ id: number; input_snapshot: { thread?: ThreadTurn[] } | null }>) {
    const turns = Array.isArray(r.input_snapshot?.thread) ? r.input_snapshot.thread : [];
    out.set(r.id, turns);
  }
  return out;
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

// ─── Completed (increment 2 §6E) ────────────────────────────────────

export type CompletedRow = {
  feedback_id: number;
  created_at: string;
  reviewer_email: string;
  reviewer_role: string;
  counts: boolean;
  verdict: string;
  reason_codes: string[];
  reason_labels: string[];
  better_text: string | null;
  note: string | null;
  gold: boolean;
  is_calibration: boolean;
  was_edited: boolean;
  context_id: number | null;
  message_type: string;
  message_ref: string;
  ghl_contact_id: string | null;
  contact_name: string | null;
  contact_city: string | null;
  office: string | null;
  channel: string | null;
  rule_applied: string | null;
  workflow_code: string | null;
  reply_text: string | null;
  ai_score: number | null;
  replied_at: string | null;
  booked_at: string | null;
  opted_out_at: string | null;
  review_lane: string | null;
  // Only on v_bot_reviews_retracted.
  retracted_at?: string | null;
  retracted_by?: string | null;
  retract_reason?: string | null;
};

export type CompletedFilters = {
  reviewer?: string | null;
  verdict?: string | null;
  lane?: string | null;
  date?: string | null;
  page?: number;
  /** "reviews" (default) | "dismissed" | "retracted" — the sub-filter. */
  show?: string | null;
};

export type CompletedResult = {
  rows: CompletedRow[];
  total: number;
  reviewers: string[];
  needsMigration: boolean;
  error: string | null;
};

const COMPLETED_COLUMNS =
  "feedback_id,created_at,reviewer_email,reviewer_role,counts,verdict,reason_codes,reason_labels," +
  "better_text,note,gold,is_calibration,was_edited,context_id,message_type,message_ref," +
  "ghl_contact_id,contact_name,contact_city,office,channel,rule_applied,workflow_code,reply_text," +
  "ai_score,replied_at,booked_at,opted_out_at,review_lane";

/**
 * One page of Completed.
 *
 * `forceReviewer` is the permission, not a filter: a team member gets their own
 * email pinned here and the `reviewer` filter is ignored, so there is no URL
 * they can type that shows them someone else's reviews. Operators and admins
 * pass null and may pick anyone, or everyone.
 */
export async function getCompleted(
  f: CompletedFilters,
  forceReviewer: string | null,
  now: Date = new Date(),
): Promise<CompletedResult> {
  const empty: CompletedResult = { rows: [], total: 0, reviewers: [], needsMigration: false, error: null };
  const retracted = f.show === "retracted";
  const view = retracted ? "v_bot_reviews_retracted" : "v_bot_reviews_completed";
  const columns = retracted ? `${COMPLETED_COLUMNS},retracted_at,retracted_by,retract_reason` : COMPLETED_COLUMNS;

  const page = Math.max(1, f.page ?? 1);
  let q = lpService()
    .from(view)
    .select(columns, { count: "exact" })
    .order("created_at", { ascending: false });

  const reviewer = forceReviewer ?? (f.reviewer && f.reviewer !== "everyone" ? f.reviewer : null);
  if (reviewer) q = q.ilike("reviewer_email", reviewer);
  if (f.verdict && f.verdict !== "all") q = q.eq("verdict", f.verdict);
  if (f.lane && f.lane !== "all") q = q.eq("review_lane", f.lane);

  const days = f.date === "today" ? 1 : f.date === "7d" ? 7 : f.date === "30d" ? 30 : 0;
  if (days > 0) q = q.gte("created_at", new Date(now.getTime() - days * 86_400_000).toISOString());

  const { data, error, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }

  // The reviewer dropdown lists people who have ACTUALLY reviewed, so it can
  // never offer a name that returns nothing. Skipped entirely for a team member,
  // who has no one to choose between.
  let reviewers: string[] = [];
  if (!forceReviewer) {
    const all = await lpService().from("v_bot_reviews_completed").select("reviewer_email").limit(1000);
    reviewers = [...new Set(((all.data ?? []) as Array<{ reviewer_email: string }>).map((r) => r.reviewer_email))].sort();
  }

  return { rows: (data ?? []) as unknown as CompletedRow[], total: count ?? 0, reviewers, needsMigration: false, error: null };
}

/**
 * The summary strip above the Completed table.
 *
 * "This week" is the trailing 7 days rather than an ET calendar week: the strip
 * answers "how much has been done lately", and on a Monday morning a calendar
 * week reads as zero work done by everyone, which is true and useless.
 */
export type CompletedSummary = {
  weekTotal: number;
  weekMine: number;
  good: number;
  needsWork: number;
  unsafe: number;
  teaching: number;
};

export async function getCompletedSummary(email: string, now: Date = new Date()): Promise<CompletedSummary> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const zero: CompletedSummary = { weekTotal: 0, weekMine: 0, good: 0, needsWork: 0, unsafe: 0, teaching: 0 };

  const { data, error } = await lpService()
    .from("v_bot_reviews_completed")
    .select("reviewer_email,verdict,gold")
    .gte("created_at", since)
    .limit(2000);

  if (error || !data) return zero;

  const rows = data as unknown as Array<{ reviewer_email: string; verdict: string; gold: boolean }>;
  const mine = email.trim().toLowerCase();
  return {
    weekTotal: rows.length,
    weekMine: rows.filter((r) => (r.reviewer_email ?? "").toLowerCase() === mine).length,
    good: rows.filter((r) => r.verdict === "good").length,
    needsWork: rows.filter((r) => r.verdict === "needs_work").length,
    unsafe: rows.filter((r) => r.verdict === "unsafe").length,
    teaching: rows.filter((r) => r.gold).length,
  };
}

/** Active dismissals, for the Completed tab's Dismissed sub-filter. */
export type DismissalRow = {
  id: number;
  scope: "message" | "conversation";
  context_id: number | null;
  ghl_contact_id: string | null;
  reason: string | null;
  dismissed_by: string;
  dismissed_at: string;
};

export async function getDismissals(page = 1): Promise<{ rows: DismissalRow[]; total: number; needsMigration: boolean }> {
  const { data, error, count } = await lpService()
    .from("bot_review_dismissals")
    .select("id,scope,context_id,ghl_contact_id,reason,dismissed_by,dismissed_at", { count: "exact" })
    .is("undone_at", null)
    .order("dismissed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) return { rows: [], total: 0, needsMigration: isMissingRelation(error) };
  return { rows: (data ?? []) as unknown as DismissalRow[], total: count ?? 0, needsMigration: false };
}

// ─── Lane-aware Scoreboard numbers (increment 2 §6F) ────────────────

/**
 * The Good rate has to come from the SPOT CHECK sample alone.
 *
 * Must-review messages are selected BECAUSE something went wrong with them —
 * the lead opted out, the bot went silent, the judge scored it 20. Averaging
 * those in drags the rate down by construction and makes "the bot got better"
 * unmeasurable. The spot check is random, so its Good rate is the real one.
 *
 * `problemsCaught` replaces the old "% reviewed" tile: on a lane system the
 * share of ALL messages reviewed is meant to be small, so it was a number that
 * looked like failure while the system worked as designed.
 */
export type LaneScoreboard = {
  spotReviewed: number;
  spotGood: number;
  spotGoodRate: number | null;
  problemsCaught: number;
  mustOpen: number;
  spotOpen: number;
  sent: number;
  needsMigration: boolean;
};

export async function getLaneScoreboard(now: Date = new Date()): Promise<LaneScoreboard> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const svc = lpService();
  const empty: LaneScoreboard = {
    spotReviewed: 0, spotGood: 0, spotGoodRate: null,
    problemsCaught: 0, mustOpen: 0, spotOpen: 0, sent: 0, needsMigration: false,
  };

  const [reviews, sent, mustOpen, spotOpen] = await Promise.all([
    svc.from("v_bot_reviews_completed")
      .select("verdict,review_lane,counts")
      .gte("created_at", since)
      .limit(2000),
    svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true }).gte("generated_at", since),
    svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true })
      .eq("review_lane", "must_review").is("dismissed", false).eq("review_count", 0),
    svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true })
      .eq("review_lane", "spot_check").is("dismissed", false).eq("review_count", 0),
  ]);

  if (reviews.error) {
    return { ...empty, needsMigration: isMissingRelation(reviews.error) };
  }

  const rows = (reviews.data ?? []) as unknown as Array<{ verdict: string; review_lane: string | null; counts: boolean }>;
  // Only calibrated reviewers move the rate, the same rule v_bot_quality_weekly
  // holds — an uncalibrated verdict is stored, shown, and not counted.
  const spot = rows.filter((r) => r.review_lane === "spot_check" && r.counts);
  const good = spot.filter((r) => r.verdict === "good").length;

  return {
    spotReviewed: spot.length,
    spotGood: good,
    spotGoodRate: spot.length > 0 ? good / spot.length : null,
    problemsCaught: rows.filter((r) => r.review_lane === "must_review").length,
    mustOpen: mustOpen.count ?? 0,
    spotOpen: spotOpen.count ?? 0,
    sent: sent.count ?? 0,
    needsMigration: false,
  };
}
