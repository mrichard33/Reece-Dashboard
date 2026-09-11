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
  { key: "compare", label: "Compare" },
  { key: "fixes", label: "Fixes" },
  { key: "learned", label: "What the bot has learned" },
  { key: "scoreboard", label: "Scoreboard" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/**
 * Which tabs this person may open (handoff §7).
 *   operator → all five
 *   team     → Review + Compare only; anything else redirects to Review
 *   exec-only→ none (the page redirects them out entirely)
 *
 * Hiding a tab is the courtesy. LP MCP is the gate for every write, and the
 * page itself redirects — this only decides what to render.
 */
export function visibleTabs(ctx: Pick<Access, "role" | "isAdmin" | "isExecOnly">): TabKey[] {
  if (ctx.isExecOnly) return [];
  if (ctx.role === "operator" || ctx.isAdmin) return TABS.map((t) => t.key);
  return ["review", "compare"];
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

export type FeedbackDraft = {
  verdict: Verdict | null;
  reasonCodes: string[];
  note: string;
  betterText: string;
  gold: boolean;
  seenBefore: boolean;
};

export type ValidationError = { field: "verdict" | "reason_codes" | "note" | "gold"; message: string };

export const emptyDraft: FeedbackDraft = {
  verdict: null,
  reasonCodes: [],
  note: "",
  betterText: "",
  gold: false,
  seenBefore: false,
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
    return { field: "gold", message: "Only a Good message can be saved as a gold example." };
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

export const SAVED_VIEWS = [
  { key: "riskiest", label: "Riskiest first" },
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
  order: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
  range: [number, number];
};

export function buildQueuePlan(f: QueueFilters, now: Date = new Date()): QueuePlan {
  const plan: QueuePlan = {
    eq: [], in: [], notNull: [], isNull: [], lt: [], gte: [],
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
