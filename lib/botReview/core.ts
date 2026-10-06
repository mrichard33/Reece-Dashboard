/**
 * Bot Review — pure helpers shared by the page, the queries and the actions.
 *
 * Everything here is a pure function so it can be unit-tested without a DB, a
 * session or a render (handoff §7: "vitest for the verdict validation, the
 * permission gating helper, and the queue query builder").
 *
 * The rules are duplicated from LP MCP's feedback-core.js ON PURPOSE. LP MCP is
 * the gate — it re-checks everything server-side and the dashboard cannot be
 * trusted. This copy exists so the reviewer sees the error *before* a round
 * trip, which is the difference between a 30-second review and a 34-second one.
 * If the two ever disagree, LP MCP wins and this file is the bug.
 */

export const VERDICTS = ["good", "needs_work", "unsafe"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const MESSAGE_TYPES = ["reply", "skip", "nurture"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export type Role = "operator" | "team";

/** Who the caller is, as the page knows them (from lib/auth getAccessContext). */
export type Access = {
  email: string;
  role: Role;
  isAdmin: boolean;
  isExecOnly: boolean;
};

// ─── Tabs ───────────────────────────────────────────────────────────

export const TABS = [
  { key: "review", label: "Review" },
  { key: "completed", label: "Completed" },
  { key: "compare", label: "Compare" },
  { key: "fixes", label: "Fixes" },
  // The key stays "learned" so existing ?tab=learned links keep working;
  // only the label changed. "What the bot has learned" came from the Phase 2
  // plan, when this tab was going to be a read-only record of approved
  // lessons. It is now the live prompt editor, and the old name sent people
  // looking under Settings for it.
  { key: "learned", label: "Bot prompts" },
  { key: "scoreboard", label: "Scoreboard" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/**
 * Which tabs this person may open (handoff §7 + increment 2 §6E).
 *   operator → all six
 *   team     → Review + Completed + Compare; anything else redirects to Review
 *   exec-only→ none (the page redirects them out entirely)
 *
 * Completed is visible to everyone who may review, including uncalibrated team
 * members: it is the record of their OWN work, and the query layer will not show
 * them anyone else's. Hiding it would mean a team member could not see, or fix,
 * a review they had just submitted.
 *
 * Hiding a tab is the courtesy. LP MCP is the gate for every write, and the
 * page itself redirects — this only decides what to render.
 */
export function visibleTabs(ctx: Pick<Access, "role" | "isAdmin" | "isExecOnly">): TabKey[] {
  if (ctx.isExecOnly) return [];
  if (ctx.role === "operator" || ctx.isAdmin) return TABS.map((t) => t.key);
  return ["review", "completed", "compare"];
}

/** Resolve a `?tab=` value to a tab this person may actually see. */
export function resolveTab(raw: string | null | undefined, ctx: Pick<Access, "role" | "isAdmin" | "isExecOnly">): TabKey {
  const allowed = visibleTabs(ctx);
  const wanted = (raw ?? "review") as TabKey;
  return allowed.includes(wanted) ? wanted : (allowed[0] ?? "review");
}

/** Approval-shaped actions are admin-only, matching the Command Center. */
export function canApprove(ctx: Pick<Access, "isAdmin">): boolean {
  return ctx.isAdmin === true;
}

/** Stopping the bot for one lead: operators and admins (plan Part 6). */
export function canStopBot(ctx: Pick<Access, "role" | "isAdmin">): boolean {
  return ctx.role === "operator" || ctx.isAdmin === true;
}

/**
 * Undoing a dismissal: operators and admins (increment 2 §6C).
 *
 * Making a dismissal is open to every reviewer, because it only hides one
 * message. Undoing one puts it back in front of EVERYONE, so it sits with the
 * wider role — the same asymmetry LP MCP's canDismiss / canUndoDismiss holds.
 */
export function canUndoDismiss(ctx: Pick<Access, "role" | "isAdmin">): boolean {
  return ctx.role === "operator" || ctx.isAdmin === true;
}

/**
 * Removing a review: its author, or an admin.
 *
 * Mirrors LP MCP's canRetract. Emails compare case-insensitively — a reviewer
 * signed in as Kim@ must not be locked out of the review kim@ wrote.
 */
export function canRetract(
  ctx: Pick<Access, "email" | "isAdmin">,
  review: { reviewer_email?: string | null } | null | undefined,
): boolean {
  if (!review) return false;
  if (ctx.isAdmin === true) return true;
  return (review.reviewer_email ?? "").trim().toLowerCase() === ctx.email.trim().toLowerCase();
}

/** Who a reviewer may read Completed rows for. Team members see only their own. */
export function canSeeOtherReviewers(ctx: Pick<Access, "role" | "isAdmin">): boolean {
  return ctx.role === "operator" || ctx.isAdmin === true;
}

/** The Retracted sub-filter is an audit view, so it is admin-only (§6E). */
export function canSeeRetracted(ctx: Pick<Access, "isAdmin">): boolean {
  return ctx.isAdmin === true;
}

/**
 * Reviewing: everyone with dashboard access except exec-only.
 *
 * Team members may review BEFORE they are calibrated — their verdicts are
 * stored with counts=false and simply don't move the rates. Blocking them would
 * make calibration impossible, since calibration is done by reviewing.
 */
export function canReview(ctx: Pick<Access, "role" | "isExecOnly">): boolean {
  return !ctx.isExecOnly && (ctx.role === "operator" || ctx.role === "team");
}

// ─── Verdict validation (mirrors sql/103 CHECKs) ────────────────────

/**
 * `gold` is the COLUMN name and stays. Everywhere a person reads it, it is
 * "teaching example" (increment 2 §6B) — "gold example" was internal jargon
 * that told a reviewer nothing about what the checkbox does.
 *
 * There is deliberately no `seenBefore`. The toggle asked a reviewer to
 * remember whether they had met this failure before; the nightly Phase 2
 * grouping counts recurrence itself, across every review, without the memory.
 * The DB column is kept so the Phase 1 rows stay readable — the UI, the draft
 * and the request body no longer carry it.
 */
export type FeedbackDraft = {
  verdict: Verdict | null;
  reasonCodes: string[];
  note: string;
  betterText: string;
  gold: boolean;
};

export type ValidationError = { field: "verdict" | "reason_codes" | "note" | "gold"; message: string };

export const emptyDraft: FeedbackDraft = {
  verdict: null,
  reasonCodes: [],
  note: "",
  betterText: "",
  gold: false,
};

/**
 * Validate a draft. Returns null when it may be submitted.
 *
 * The messages are the ones in the approved design, verbatim — they are shown
 * under the control they belong to, never as a banner.
 */
export function validateDraft(draft: FeedbackDraft): ValidationError | null {
  if (!draft.verdict) {
    return { field: "verdict", message: "Pick Good, Needs work, or Unsafe." };
  }
  if (draft.verdict !== "good" && draft.reasonCodes.length === 0) {
    return { field: "reason_codes", message: "Pick at least one reason before you submit." };
  }
  if (draft.verdict === "unsafe" && draft.note.trim() === "") {
    return { field: "note", message: "A note is required on Unsafe. Tell us what could go wrong." };
  }
  if (draft.gold && draft.verdict !== "good") {
    return { field: "gold", message: "Only a Good message can be used as a teaching example." };
  }
  return null;
}

/** Reason chips only appear once the verdict says something went wrong. */
export function showsReasons(verdict: Verdict | null): boolean {
  return verdict === "needs_work" || verdict === "unsafe";
}

/**
 * Nurture messages answer no inbound, so two reasons make no sense for them
 * and the design hides them rather than letting a reviewer pick a reason the
 * Phase 2 clustering could never act on.
 */
const NURTURE_HIDDEN_REASONS = new Set(["dodged_question", "should_have_replied"]);

export function reasonsForType<T extends { code: string }>(reasons: T[], messageType: MessageType): T[] {
  if (messageType !== "nurture") return reasons;
  return reasons.filter((r) => !NURTURE_HIDDEN_REASONS.has(r.code));
}

/**
 * A rewrite only counts when it actually differs from what the bot said. The
 * box is pre-filled with the bot's text, so submitting it untouched would
 * otherwise store thousands of "corrections" identical to the original and
 * poison the Phase 2 example library.
 */
export function effectiveRewrite(betterText: string, originalText: string | null): string | null {
  const next = betterText.trim();
  if (!next) return null;
  if (next === (originalText ?? "").trim()) return null;
  return next;
}

// ─── Queue query builder ────────────────────────────────────────────

export type QueueFilters = {
  lane?: string | null;
  view?: string | null;
  channel?: string | null;
  type?: string | null;
  rule?: string | null;
  outcome?: string | null;
  office?: string | null;
  status?: string | null;
  date?: string | null;
  page?: number;
};

// ─── Review lanes (increment 2 §6A) ─────────────────────────────────

/**
 * Three lanes instead of one queue.
 *
 * Reviewing every message was never going to be sustained — roughly ninety
 * messages a week, each needing the thread read around it. So the system decides
 * what a human MUST look at (a message that already went wrong, or that the AI
 * judge scored badly), takes a stable random sample of the rest for an honest
 * quality number, and leaves everything else browsable but not demanded.
 *
 * `none` is not a lane anyone works. It exists so "Everything" has a name for
 * the messages that are neither.
 */
export const LANES = [
  {
    key: "must_review",
    label: "Must review",
    blurb:
      "Messages that already went wrong or scored badly: the lead opted out after it, the bot stayed silent, the AI judge scored it low, or someone stopped the bot right after. These are the ones worth your time.",
  },
  {
    key: "spot_check",
    label: "Spot check",
    blurb:
      "A small random sample of everything else. It is what the Good rate is measured on — random so the number is honest, and fixed per message so it never moves when new data lands.",
  },
  {
    key: "everything",
    label: "Everything",
    blurb:
      "Every message the bot has sent, with the old saved views as ordinary filters. Nothing here is asking to be reviewed — it is for looking something up.",
  },
] as const;

export type LaneKey = (typeof LANES)[number]["key"];

/**
 * The count badge beside each lane. Lives here rather than in the query layer
 * so the client-side switcher can take the type without pulling a module that
 * imports a server-only Supabase client.
 */
export type LaneCounts = Record<LaneKey, number>;

export const DEFAULT_LANE: LaneKey = "must_review";

/** A lane from the URL, or the default. Unknown values fall back rather than 404. */
export function resolveLane(raw: string | null | undefined): LaneKey {
  const wanted = (raw ?? "").trim();
  return (LANES.find((l) => l.key === wanted)?.key ?? DEFAULT_LANE) as LaneKey;
}

/** The rose chip on a Must-review row, straight from the view. */
export type MustReviewCause =
  | "Opted out after"
  | "Bot stayed silent"
  | "Low AI score"
  | "Bot stopped after";

/**
 * The saved views from Phase 1. They are no longer a top-level control — the
 * lane switcher took that position — but they survive as ordinary filters
 * inside Everything, because "show me the price objections" is still a question
 * someone asks. "Riskiest first" is dropped: it was never a filter, it is the
 * default sort, and it is applied to every lane.
 */
export const SAVED_VIEWS = [
  { key: "riskiest", label: "All" },
  { key: "unreviewed", label: "Unreviewed" },
  { key: "silent", label: "Bot stayed silent" },
  { key: "optedout", label: "Opted out after" },
  { key: "price", label: "Price objections" },
  { key: "lowscore", label: "Low AI score" },
] as const;

export const PAGE_SIZE = 25;

/**
 * Turn the URL's filters into a declarative plan the query layer applies to a
 * PostgREST builder. Pure so the mapping is testable without a database — the
 * thing that actually breaks here is a saved view quietly matching nothing.
 */
export type QueuePlan = {
  eq: Array<[string, string]>;
  in: Array<[string, string[]]>;
  notNull: string[];
  isNull: string[];
  lt: Array<[string, number]>;
  gte: Array<[string, string]>;
  is: Array<[string, boolean]>;
  order: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
  range: [number, number];
};

export function buildQueuePlan(f: QueueFilters, now: Date = new Date()): QueuePlan {
  const plan: QueuePlan = {
    eq: [], in: [], notNull: [], isNull: [], lt: [], gte: [], is: [],
    // Riskiest first is the default sort everywhere: priority ascending (1 is
    // worst), then newest. Every saved view keeps it unless it says otherwise.
    order: [
      { column: "priority", ascending: true },
      { column: "generated_at", ascending: false },
    ],
    range: [0, PAGE_SIZE - 1],
  };

  const page = Math.max(1, f.page ?? 1);
  plan.range = [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1];

  /*
   * The lane comes first, because it decides what the other filters narrow.
   *
   * Must review and Spot check are WORK QUEUES: they hold only what is still
   * open, so a dismissed message and one that already carries a review both
   * leave. Everything is a LOOKUP, so it hides nothing — a dismissed row is
   * still shown there, with its chip and its undo.
   */
  const lane = resolveLane(f.lane);
  if (lane !== "everything") {
    plan.eq.push(["review_lane", lane]);
    plan.is.push(["dismissed", false]);
    plan.eq.push(["review_count", "0"]);
  }

  if (f.channel && f.channel !== "all") plan.eq.push(["channel", f.channel]);
  if (f.office && f.office !== "all") plan.eq.push(["office", f.office]);
  if (f.rule && f.rule !== "all") plan.eq.push(["rule_applied", f.rule]);

  if (f.type && f.type !== "all") {
    // "Replies" means conversational sends — a skip is its own filter.
    if (f.type === "replies") plan.eq.push(["message_type", "reply"]);
    else if (f.type === "nurture") plan.eq.push(["message_type", "nurture"]);
    else if (f.type === "skipped") plan.eq.push(["message_type", "skip"]);
  }

  if (f.outcome && f.outcome !== "all") {
    if (f.outcome === "booked") plan.notNull.push("booked_at");
    else if (f.outcome === "replied") plan.notNull.push("replied_at");
    else if (f.outcome === "no_reply") plan.isNull.push("replied_at");
    else if (f.outcome === "opted_out") plan.notNull.push("opted_out_at");
  }

  if (f.status === "unreviewed") plan.eq.push(["review_count", "0"]);
  if (f.status === "flagged") plan.in.push(["consensus_verdict", ["needs_work", "unsafe"]]);

  switch (f.view) {
    case "unreviewed":
      plan.eq.push(["review_count", "0"]);
      break;
    case "silent":
      plan.eq.push(["message_type", "skip"]);
      break;
    case "optedout":
      plan.notNull.push("opted_out_at");
      break;
    case "price":
      // Price objections are the OBJ_PRICE_* family; matched by rule prefix in
      // the query layer, which is why this lands as an `in` of known rules
      // rather than a LIKE the plan cannot express.
      plan.in.push(["rule_applied", ["OBJ_PRICE_STRIKE1", "OBJ_PRICE_STRIKE2", "OBJ_PRICE"]]);
      break;
    case "lowscore":
      plan.lt.push(["ai_score", 60]);
      break;
    case "riskiest":
    default:
      break;
  }

  if (f.date && f.date !== "all") {
    const days = f.date === "today" ? 1 : f.date === "yesterday" ? 2 : f.date === "7d" ? 7 : 0;
    if (days > 0) {
      plan.gte.push(["generated_at", new Date(now.getTime() - days * 86_400_000).toISOString()]);
    }
  }

  return plan;
}

// ─── Display helpers ────────────────────────────────────────────────

/** AI score → badge tone. Thresholds are the design's: 80+, 60–79, <60. */
export function scoreTone(score: number | null | undefined): "emerald" | "amber" | "rose" | "slate" {
  if (score == null) return "slate";
  if (score >= 80) return "emerald";
  if (score >= 60) return "amber";
  return "rose";
}

/**
 * The one status signal a queue row shows, in priority order. A row that opted
 * out is never shown as "AI score 91" — the outcome outranks the score.
 */
export function queueSignal(row: {
  opted_out_at?: string | null;
  message_type?: string | null;
  ai_score?: number | null;
}): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } {
  if (row.opted_out_at) return { label: "Opted out after", tone: "rose" };
  if (row.message_type === "skip") return { label: "Bot stayed silent", tone: "rose" };
  if (row.ai_score == null) return { label: "Not scored yet", tone: "slate" };
  return { label: `AI score ${Math.round(row.ai_score)}`, tone: scoreTone(row.ai_score) };
}

/** Everything user-facing renders in ET (handoff §0). */
export function formatEt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET`;
}

/**
 * Below the minimum sample a rate is noise, so the Scoreboard shows
 * "Not enough data yet" rather than a percentage built on four reviews
 * (plan Part 8, "honest-numbers rules").
 */
export const MIN_SAMPLE = 30;

export function enoughData(reviewed: number | null | undefined): boolean {
  return (reviewed ?? 0) >= MIN_SAMPLE;
}

/** Format a 0–1 rate as a percentage, or null when the sample is too small. */
export function ratePct(rate: number | null | undefined, reviewed: number | null | undefined): string | null {
  if (!enoughData(reviewed) || rate == null) return null;
  return `${Math.round(rate * 100)}%`;
}

/**
 * How a conversation is labelled everywhere in the Review tab.
 *
 * The name first, because a reviewer who spots a bad reply needs to find that
 * person in LeadPerfection or GHL — and because "Lead · ORL_MKT" made four
 * separate messages to the SAME contact look like four different leads.
 * The city, not the market code: ORL_MKT is an internal routing label.
 * Falls back through city → market → "Lead" so a row is never blank.
 */
export function contactLabel(row: {
  contact_name?: string | null;
  contact_city?: string | null;
  office?: string | null;
}): string {
  const name = row.contact_name?.trim();
  const where = row.contact_city?.trim() || row.office?.trim() || null;
  if (name) return where ? `${name} · ${where}` : name;
  return where ? `Lead · ${where}` : "Lead";
}

/** Just the person, for places where the location is already on screen. */
export function contactNameOnly(row: { contact_name?: string | null }): string {
  return row.contact_name?.trim() || "Unnamed lead";
}

// ─── Conversations ──────────────────────────────────────────────────

/**
 * The queue's unit is a conversation, not a message.
 *
 * The bot sends one lead several messages over days. Listing each one as its
 * own box made four messages to Alfredo Fontan look like four different leads,
 * and it asked the reviewer to judge a reply without the replies around it —
 * which is exactly the context needed to tell a good reply from a bad one.
 *
 * So: group by contact, show the whole thread, and let the reviewer click the
 * message they want to score.
 */

export type ConversationRow = {
  context_id: number;
  ghl_contact_id: string | null;
  channel: string | null;
  message_type?: string | null;
  generated_at: string;
  sent_at?: string | null;
  review_count: number;
  opted_out_at?: string | null;
  ai_score?: number | null;
  contact_name?: string | null;
  contact_city?: string | null;
  office?: string | null;
};

export type Conversation<R extends ConversationRow> = {
  /** Stable key for React and for the `?contact=` param. */
  key: string;
  contactId: string | null;
  label: string;
  rows: R[];
  messageCount: number;
  unreviewedCount: number;
  latestAt: string;
  channels: string[];
  signal: { label: string; tone: "emerald" | "amber" | "rose" | "slate" };
};

/**
 * Fold queue rows into one entry per contact.
 *
 * Order is preserved: a conversation sits where its FIRST row sat, so the
 * view's priority sort still decides what a reviewer sees first. That also
 * means the group's headline signal is the first row's — by the view's own
 * priority the most urgent message in the group — rather than a second ranking
 * invented here that could disagree with the sort.
 *
 * A row with no GHL contact id gets its own group. Two such rows cannot be
 * shown to be the same person, and merging them on a guess would put one
 * lead's messages in another lead's thread.
 */
export function groupByContact<R extends ConversationRow>(rows: R[]): Array<Conversation<R>> {
  const out: Array<Conversation<R>> = [];
  const byKey = new Map<string, Conversation<R>>();

  for (const row of rows) {
    const key = row.ghl_contact_id ? `c:${row.ghl_contact_id}` : `x:${row.context_id}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        contactId: row.ghl_contact_id,
        label: contactLabel(row),
        rows: [],
        messageCount: 0,
        unreviewedCount: 0,
        latestAt: row.generated_at,
        channels: [],
        signal: queueSignal(row),
      };
      byKey.set(key, group);
      out.push(group);
    }
    group.rows.push(row);
    group.messageCount += 1;
    if (row.review_count === 0) group.unreviewedCount += 1;
    if (row.generated_at > group.latestAt) group.latestAt = row.generated_at;
    if (row.channel && !group.channels.includes(row.channel)) group.channels.push(row.channel);
  }

  return out;
}

/** The conversation a given message belongs to. */
export function findConversation<R extends ConversationRow>(
  groups: Array<Conversation<R>>,
  contextId: number | null,
): Conversation<R> | null {
  if (contextId == null) return null;
  return groups.find((g) => g.rows.some((r) => r.context_id === contextId)) ?? null;
}

export type TimelineTurn = {
  kind: "turn";
  key: string;
  at: string | null;
  inbound: boolean;
  body: string | null;
};

export type TimelineMessage = {
  kind: "message";
  key: string;
  at: string;
  contextId: number;
  /**
   * The lead message this one answers, taken from the thread, when the row
   * recorded none. A rule-written send (SERVICE_AREA_EXIT, …) skipped
   * generation and filed inbound_text = null until LP MCP 2026-10-06.
   */
  replyingTo: string | null;
};

export type TimelineItem = TimelineTurn | TimelineMessage;

export type SnapshotTurn = {
  direction?: string | null;
  body?: string | null;
  at?: string | null;
  channel?: string | null;
  /** LP MCP 2026-10-06+. Older snapshots carry no kind. */
  kind?: "message" | "activity" | null;
};

export type TimelineRow = {
  context_id: number;
  reply_text?: string | null;
  inbound_text?: string | null;
  message_type?: string | null;
  sent_at?: string | null;
  generated_at: string;
};

export type TimelineOptions = {
  /**
   * bot_settings.review_thread_cutover_at. Any timestamped turn before it is
   * hidden (Mark, 2026-10-06: nothing from before the new agentic system).
   */
  cutoverAt?: string | null;
};

/** Whitespace and case are not differences worth keeping two copies over. */
function normText(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * An instant, in epoch milliseconds — or null when there isn't one.
 *
 * 2026-09-14: the timeline used to sort with localeCompare on the raw strings,
 * which is only correct when every value is the same ISO shape with the same
 * offset. Snapshot turns and queue rows are written by different sources, so
 * "2026-09-11T19:36:00Z" and "2026-09-11 15:36:00-04:00" — the same instant —
 * sorted hours apart and the conversation read as nonsense.
 */
function epoch(at: string | null | undefined): number | null {
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * GHL activity entries, as their text reads in a snapshot that predates
 * LP MCP's `kind` field (2026-10-06). GHL returns these from the same
 * messages endpoint as real messages, and the old snapshot labelled every one
 * an outbound turn — so "Opportunity created" showed as the bot speaking
 * (Charles Jessup, context 414: six of them). One list, so the rule is
 * readable and tested in one place.
 */
export const ACTIVITY_BODY_PATTERNS: readonly RegExp[] = [
  /^(Opportunity (created|updated|status changed)|Appointment (created|updated|booked|cancelled)|Task (created|completed)|Note added)$/i,
  / - Window Estimate$/i,
];

/** Is this snapshot turn a GHL activity row rather than something someone said? */
export function isActivityTurn(t: SnapshotTurn): boolean {
  if (t.kind === "activity") return true;
  if (t.kind === "message") return false;
  // Old snapshot: only an outbound turn with no channel can be one.
  if (t.direction !== "outbound" || t.channel) return false;
  const body = (t.body ?? "").trim();
  return ACTIVITY_BODY_PATTERNS.some((rx) => rx.test(body));
}

/**
 * Plain words for each skip_reason code a reviewer sees on a "Bot didn't
 * reply" note. An unknown code shows as itself — a new code is still
 * readable, just not translated yet.
 */
export const SKIP_REASON_LABELS: Readonly<Record<string, string>> = {
  superseded_by_newer_job: "a newer message took over",
  superseded_by_newer_inbound: "the lead wrote again, so that reply took over",
  superseded_by_newer_message: "the lead wrote again, so that reply took over",
  answered_since_inbound: "it was already answered",
  compliance_gate_handoff: "a person took over",
  suppressed: "the contact is set not to get bot messages",
  suppressed_at_send_time: "the contact is set not to get bot messages",
  decision_maker_message_generation_failed: "the reply could not be written",
  no_trigger_message_in_event_context: "there was no message to answer",
};

export function skipReasonLabel(code: string | null | undefined): string {
  if (!code) return "no reason recorded";
  return SKIP_REASON_LABELS[code] ?? code;
}

function lastIndex<T>(arr: T[], pred: (t: T) => boolean, before = arr.length): number {
  for (let i = before - 1; i >= 0; i--) if (pred(arr[i]!)) return i;
  return -1;
}

const isIn = (t: SnapshotTurn) => t.direction === "inbound";

/**
 * Where the new system's part of one snapshot starts (Mark, 2026-10-06: Bot
 * Review shows nothing from before the new agentic system took over; the old
 * GHL Conversation AI history is hidden here, never deleted).
 *
 * The anchor is the contact's FIRST bot_message_context row. From it, the
 * thread shows the inbound turn immediately before that first message, and
 * everything after. In order of evidence:
 *   1. a turn whose text IS that first message (its reply, or its inbound);
 *   2. timestamps — turns at or after the inbound that triggered it;
 *   3. neither: nothing that could be from before it. A later snapshot that
 *      no longer contains the first reply but does contain a later bot reply
 *      started after the first one, so it is kept whole.
 */
function cutoffStart(
  turns: SnapshotTurn[],
  ownFirst: boolean,
  first: TimelineRow,
  laterReplies: Set<string>,
  triggerAt: number | null,
): number {
  const firstReply = normText(first.reply_text);
  const firstInbound = normText(first.inbound_text);
  const firstGen = epoch(first.generated_at);

  if (ownFirst) {
    // The first message's own snapshot is everything BEFORE it: keep only the
    // inbound it answered.
    if (firstInbound) {
      const j = lastIndex(turns, (t) => isIn(t) && normText(t.body) === firstInbound);
      if (j >= 0) return j;
    }
    if (firstGen != null) {
      const j = lastIndex(turns, (t) => isIn(t) && (epoch(t.at) ?? Infinity) <= firstGen);
      if (j >= 0) return j;
    }
    const j = lastIndex(turns, isIn);
    return j >= 0 ? j : turns.length;
  }

  if (firstReply) {
    const i = turns.findIndex((t) => !isIn(t) && normText(t.body) === firstReply);
    if (i >= 0) {
      const j = lastIndex(turns, isIn, i);
      return j >= 0 ? j : i;
    }
  }
  if (firstInbound) {
    const j = lastIndex(turns, (t) => isIn(t) && normText(t.body) === firstInbound);
    if (j >= 0) return j;
  }
  if (triggerAt != null && turns.some((t) => epoch(t.at) != null)) {
    const k = turns.findIndex((t) => (epoch(t.at) ?? -Infinity) >= triggerAt);
    return k >= 0 ? k : turns.length;
  }
  if (firstReply && turns.some((t) => !isIn(t) && laterReplies.has(normText(t.body)))) return 0;
  return turns.length;
}

/**
 * When the inbound that triggered the contact's first new-system message
 * arrived, from any snapshot that dates it. Falls back to that message's own
 * time. Null when no snapshot has a timestamp to compare against.
 */
function firstTriggerAt(first: TimelineRow, snapshots: Map<number, SnapshotTurn[]>): number | null {
  const firstGen = epoch(first.generated_at);
  const want = normText(first.inbound_text);
  let matched: number | null = null;
  let latest: number | null = null;
  let anyDated = false;
  for (const turns of snapshots.values()) {
    for (const t of turns) {
      const e = epoch(t.at);
      if (e == null) continue;
      anyDated = true;
      if (!isIn(t) || (firstGen != null && e > firstGen)) continue;
      if (want && normText(t.body) === want && (matched == null || e > matched)) matched = e;
      if (latest == null || e > latest) latest = e;
    }
  }
  if (!anyDated) return null;
  return matched ?? latest ?? firstGen;
}

/**
 * One timeline for a whole conversation.
 *
 * Each message carries its own snapshot of the thread AS THE BOT SAW IT, so
 * consecutive messages overlap heavily — and every bot reply reappears as a
 * plain outbound turn inside every later snapshot. Both are deduped here:
 * identical turns collapse, and an outbound turn that repeats a reviewable
 * message is dropped so the message itself is the only copy on screen. A
 * reviewer must never see the same reply twice and have to guess which one the
 * verdict lands on.
 *
 * 2026-10-06 (Charles Jessup): GHL activity rows are hidden, nothing from
 * before the new system is shown, and an undated turn is placed by POSITION —
 * between the known points around it in its snapshot (a dated turn, or a turn
 * that is one of our replies, which sits at that reply's time) — instead of
 * taking its parent message's time. Every old snapshot turn was undated, so
 * all of them landed on the reviewed reply's instant and the thread rendered
 * out of order.
 *
 * `rows` are the reviewable messages, oldest first; `snapshots` maps a context
 * id to the thread captured for it.
 */
export function buildTimeline(
  rows: TimelineRow[],
  snapshots: Map<number, SnapshotTurn[]>,
  opts: TimelineOptions = {},
): TimelineItem[] {
  /*
   * Ordering runs on three numeric keys, never on the item itself:
   *
   *   at    — the instant, in epoch ms. A placed turn takes the instant of the
   *           next known point after it in its snapshot.
   *   slot  — turns (0) before messages (1) on an equal instant, because every
   *           turn in a snapshot happened BEFORE the message that captured it.
   *   order — snapshot position (row, then turn index), or the row index.
   */
  type Entry = { item: TimelineItem; at: number; slot: 0 | 1; order: number };
  const entries: Entry[] = [];
  const SPAN = 100_000; // turns per snapshot slot in `order`; snapshots are ≤ a few dozen turns

  /*
   * An unparseable message time falls back to the previous message's instant
   * rather than to zero: `rows` arrive oldest-first, so that keeps a bad value
   * next to its neighbours instead of throwing it to the top of the thread.
   */
  const anchors = new Map<number, number>();
  let lastKnown = 0;
  rows.forEach((r, i) => {
    const raw = r.sent_at ?? r.generated_at;
    const at = epoch(raw) ?? lastKnown;
    lastKnown = at;
    anchors.set(r.context_id, at);
    entries.push({
      item: { kind: "message", key: `m:${r.context_id}`, at: raw, contextId: r.context_id, replyingTo: null },
      at,
      slot: 1,
      order: i * SPAN + (SPAN - 1),
    });
  });

  // A reply's text → the instant it went out (first row wins on a repeat).
  const replyAt = new Map<string, number>();
  rows.forEach((r) => {
    const k = normText(r.reply_text);
    if (k && !replyAt.has(k)) replyAt.set(k, anchors.get(r.context_id)!);
  });

  const first = rows[0];
  const laterReplies = new Set(rows.slice(1).map((r) => normText(r.reply_text)).filter(Boolean));
  const triggerAt = first ? firstTriggerAt(first, snapshots) : null;
  const cutover = epoch(opts.cutoverAt ?? null);

  const seen = new Set<string>();
  const shownInbound = new Set<string>();

  rows.forEach((row, rowIdx) => {
    const anchor = anchors.get(row.context_id) ?? lastKnown;
    const all = snapshots.get(row.context_id) ?? [];
    const start = first ? cutoffStart(all, rowIdx === 0, first, laterReplies, triggerAt) : 0;

    const kept = all
      .map((t, idx) => ({ t, idx }))
      .filter(({ t, idx }) => {
        if (idx < start) return false;
        if (isActivityTurn(t)) return false;
        const e = epoch(t.at);
        if (cutover != null && e != null && e < cutover) return false;
        return true;
      });

    // Known points: a dated turn, or a turn that is one of our replies.
    const known = kept.map(({ t }) => epoch(t.at) ?? (isIn(t) ? null : (replyAt.get(normText(t.body)) ?? null)));

    kept.forEach(({ t, idx }, k) => {
      const inbound = isIn(t);
      const body = normText(t.body);
      let at = known[k];
      if (at == null) {
        // Positional: the next known point after it in this snapshot, and the
        // message that captured the snapshot is the last point of all.
        for (let n = k + 1; n < known.length && at == null; n++) at = known[n] ?? null;
        at ??= anchor;
      }
      if (!inbound && body && replyAt.has(body)) return;
      const key = `${inbound ? "in" : "out"}|${t.at ?? ""}|${body}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (inbound && body) shownInbound.add(body);
      entries.push({
        item: { kind: "turn", key: `t:${seen.size}`, at: t.at ?? null, inbound, body: t.body ?? null },
        at,
        slot: 0,
        order: rowIdx * SPAN + idx,
      });
    });
  });

  /*
   * A skip quotes the message it did not answer, unless the thread shows it.
   * A reply does the same: live-chat rows store the lead's message but no
   * snapshot, so without this a chat read as the bot talking to itself.
   */
  rows.forEach((row, rowIdx) => {
    const body = normText(row.inbound_text);
    if (row.message_type === "nurture" || !body || shownInbound.has(body)) return;
    // Two rows in a row on the same words answer one message (a reply and the
    // skip it overtook); further apart, a second "yes" is a second message.
    if (rowIdx > 0 && normText(rows[rowIdx - 1]!.inbound_text) === body) return;
    entries.push({
      item: { kind: "turn", key: `s:${row.context_id}`, at: null, inbound: true, body: row.inbound_text ?? null },
      at: anchors.get(row.context_id) ?? lastKnown,
      slot: 0,
      order: rowIdx * SPAN + (SPAN - 2),
    });
  });

  entries.sort((a, b) => a.at - b.at || a.slot - b.slot || a.order - b.order);
  const items = entries.map((e) => e.item);

  // A message with no recorded inbound replies to the lead turn above it.
  const byId = new Map(rows.map((r) => [r.context_id, r]));
  let lastLead: string | null = null;
  for (const item of items) {
    if (item.kind === "turn") {
      if (item.inbound && item.body) lastLead = item.body;
      continue;
    }
    const row = byId.get(item.contextId);
    if (row && !row.inbound_text && row.message_type !== "nurture" && row.message_type !== "skip") {
      item.replyingTo = lastLead;
    }
  }
  return items;
}
