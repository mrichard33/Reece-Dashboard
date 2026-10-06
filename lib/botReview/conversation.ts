/**
 * Bot Review — the conversation a reviewer reads (2026-10-06, Revin-style view).
 *
 * Pure: no database, no clock, no render. The page reads five things in
 * parallel (lib/queries/botReview.ts getConversationTimeline) and hands them
 * here.
 *
 * WHY this replaced the input_snapshot thread: every turn in an old snapshot
 * had `at` = null and `channel` = null, and GHL activity rows ("Opportunity
 * created") were in it labelled as the bot. Charles Jessup's thread rendered
 * out of order with six fake bot bubbles. The HL `messages` mirror holds every
 * real GHL message with its real `sent_at` and no activity rows, so it is the
 * thread now. bot_message_context says which outbound messages the bot wrote;
 * agent_actions says when the bot was stopped, paused or turned back on.
 *
 * Rules that are easy to break (each one is a test in conversation.test.ts):
 *   - Order is by real time only. A missing time is never borrowed from
 *     another message.
 *   - Old GHL Conversation AI history is hidden, never deleted (Mark,
 *     2026-10-06), and there is no "show" control.
 *   - The "why" text is built by code from the data (AI OS CANON.P.001). No
 *     model writes it.
 *   - Never a pronoun for the contact: the text uses their first name.
 */

import { OUT_OF_AREA_TAGS, THREAD_OPTOUT_TAGS } from "./contactTags";

// ─── Inputs ──────────────────────────────────────────────────────────

/** One row of the HL `messages` mirror. */
export type HlMessage = {
  ghl_message_id: string;
  direction: string | null;
  /** GHL message type: 2 SMS, 3 email, 29 live chat, 1 call. Stored as text. */
  type: string | number | null;
  body: string | null;
  sent_at: string | null;
};

/** One bot_message_context row, as the review queue view returns it. */
export type BotRow = {
  context_id: number;
  message_type: string;
  rule_applied: string | null;
  workflow_code?: string | null;
  reply_text: string | null;
  inbound_text?: string | null;
  skip_reason: string | null;
  generated_at: string;
  sent_at: string | null;
  ai_score: number | null;
  channel: string | null;
};

/** One add_tag / remove_tag action from agent_actions. */
export type TagEvent = {
  tag: string;
  action: "add_tag" | "remove_tag";
  /** coalesce(executed_at, created_at) */
  at: string;
};

export type ConversationInput = {
  messages: HlMessage[];
  rows: BotRow[];
  tagEvents: TagEvent[];
  /** bot_settings.review_thread_cutover_at */
  cutoverAt: string | null;
  /** bot_settings.must_review_score_below */
  mustReviewScoreBelow: number;
};

// ─── Output ──────────────────────────────────────────────────────────

export type IssueTone = "amber" | "rose";

export type Issue = {
  label: string;
  tone: IssueTone;
  /** The DOM id of the message the chip points at. */
  anchor: string;
};

type Base = { key: string; at: string };

export type ConvItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "session"; key: string; sender: "bot" | "other"; label: string; count: number; startAt: string }
  | (Base & { kind: "lead"; channelLabel: string; body: string })
  | (Base & {
      kind: "bot";
      anchor: string;
      channelLabel: string;
      isEmail: boolean;
      body: string;
      contextId: number;
      ruleApplied: string | null;
      aiScore: number | null;
      /** First 40 characters of the lead message before it, or null. */
      replyingTo: string | null;
      /** False when the bot's record has no matching message in the GHL mirror. */
      matched: boolean;
      notSent: boolean;
      issues: Issue[];
    })
  | (Base & { kind: "other_outbound"; anchor: string; channelLabel: string; isEmail: boolean; body: string; issues: Issue[] })
  | (Base & { kind: "event"; text: string; tone: "slate" | "rose"; contextId: number | null });

export type ConversationView = {
  items: ConvItem[];
  issues: Issue[];
  /** The one quiet line at the top. */
  notice: string;
  /** The earliest instant shown, ISO. */
  cutoffAt: string | null;
  /** Every tag-change line, drawn or not, for the Why text. */
  stateEvents: Array<{ at: string; text: string }>;
};

export const HIDDEN_HISTORY_NOTICE = "New system only. Older GHL Conversation AI history is hidden.";

/** Two messages farther apart than this are never the same send. */
export const MATCH_WINDOW_MS = 120_000;
/** Tag changes closer together than this are one line. */
export const TAG_COLLAPSE_MS = 10_000;
/** How far before the contact's first new-system message the thread starts. */
export const LEAD_IN_MS = 24 * 3_600_000;
export const DEFAULT_CUTOVER_AT = "2026-09-11T19:00:00Z";
export const DEFAULT_MUST_REVIEW_SCORE_BELOW = 60;

// ─── Labels ──────────────────────────────────────────────────────────

/**
 * Plain words for each skip_reason code. An unknown code shows as itself — a
 * new code is still readable, just not translated yet.
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

/** The session header's name for a rule. Unknown rules show the raw code. */
export function friendlyRuleName(rule: string | null | undefined, workflowCode?: string | null): string {
  if (rule === "SERVICE_AREA_EXIT") return "Service-area check";
  if (rule && rule.startsWith("AGENTIC_RESPOND")) return "Reply";
  if (rule) return rule;
  if (workflowCode) return `Nurture ${workflowCode}`;
  return "Message";
}

export function channelLabel(type: string | number | null | undefined): string {
  const t = String(type ?? "").trim();
  if (t === "2") return "SMS";
  if (t === "3") return "Email";
  if (t === "29") return "Live chat";
  if (t === "1") return "Call";
  return "Message";
}

/** A bot_message_context channel ('sms' | 'email' | 'live_chat') as a label. */
function rowChannelLabel(channel: string | null): string {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  if (channel === "live_chat") return "Live chat";
  return "Message";
}

type TagLine = { text: string; state?: State; clears?: State };
type State = "out_of_area" | "paused" | "bot_stopped" | "opted_out";

/** What each tag change says, and which state it sets or clears. */
function tagLine(e: TagEvent): TagLine | null {
  const tag = e.tag.trim().toLowerCase();
  const added = e.action === "add_tag";
  if (OUT_OF_AREA_TAGS.includes(tag)) {
    return added
      ? { text: "Marked out of service area", state: "out_of_area" }
      : { text: "Out-of-area mark removed", clears: "out_of_area" };
  }
  if (tag === "suppress-outbound") {
    return added
      ? { text: "Outbound messages paused", state: "paused" }
      : { text: "Outbound messages resumed", clears: "paused" };
  }
  if (tag === "stop-bot") {
    return added ? { text: "Bot stopped", state: "bot_stopped" } : { text: "Bot stop removed", clears: "bot_stopped" };
  }
  if (tag === "agentic-active") return { text: added ? "Bot turned on" : "Bot turned off" };
  if (THREAD_OPTOUT_TAGS.includes(tag)) {
    return added
      ? { text: "Opted out · texts and calls stopped", state: "opted_out" }
      : { text: "Opt-out tag removed", clears: "opted_out" };
  }
  return null;
}

const STATE_CHIP: Record<State, string> = {
  opted_out: "Sent after opt-out",
  bot_stopped: "Sent after bot stopped",
  out_of_area: "Sent after out-of-area",
  paused: "Sent after outbound paused",
};

/*
 * One chip per message: the state that most plainly should have stopped THAT
 * sender. stop-bot gates only the bot (checkConversationGate), and the service
 * area is the bot's own decision, so a workflow text is judged on the pause.
 */
const BOT_STATE_ORDER: State[] = ["opted_out", "bot_stopped", "out_of_area", "paused"];
const OTHER_STATE_ORDER: State[] = ["opted_out", "paused", "out_of_area"];

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * A message body as a person reads it. Live-chat replies the bot sends through
 * a GHL inbound-webhook workflow reach the mirror wrapped in HTML
 * (`<p style=…><span data-cv-variable="inboundWebhookRequest.message">…`), so
 * without this they neither matched their bot row nor read as words (Victor
 * Effron, 2026-10-06). Plain text passes through untouched.
 */
export function plainText(s: string | null | undefined): string {
  const raw = s ?? "";
  if (!/<[a-z!/][^>]*>/i.test(raw)) return raw;
  return raw
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whitespace, case and HTML are not differences worth keeping two copies over. */
export function normText(s: string | null | undefined): string {
  return plainText(s).trim().replace(/\s+/g, " ").toLowerCase();
}

function epoch(at: string | null | undefined): number | null {
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

const ET = "America/New_York";

/** "10:24 AM" in ET. */
export function timeEt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
}

/** "Monday, Oct 5" in ET. */
export function dayEt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: ET, weekday: "long", month: "short", day: "numeric" });
}

/** The ET calendar date as YYYY-MM-DD, for comparing days. */
function dateKeyEt(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: ET });
}

function hourEt(ms: number): number {
  return Number(new Date(ms).toLocaleString("en-US", { timeZone: ET, hour: "numeric", hour12: false })) % 24;
}

function clip(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}

// ─── The merge ───────────────────────────────────────────────────────

/** The earliest instant the thread shows (Mark, 2026-10-06). */
export function threadCutoff(rows: BotRow[], cutoverAt: string | null): number | null {
  const cutover = epoch(cutoverAt) ?? epoch(DEFAULT_CUTOVER_AT);
  const gens = rows.map((r) => epoch(r.generated_at)).filter((n): n is number => n != null);
  const firstNew = gens.length ? Math.min(...gens) : null;
  if (firstNew == null) return cutover;
  return Math.max(cutover ?? -Infinity, firstNew - LEAD_IN_MS);
}

type Flat =
  | { kind: "lead"; ms: number; at: string; channelLabel: string; body: string; ord: number }
  | {
      kind: "bot";
      ms: number;
      at: string;
      channelLabel: string;
      isEmail: boolean;
      body: string;
      row: BotRow;
      matched: boolean;
      notSent: boolean;
      ord: number;
    }
  | { kind: "other_outbound"; ms: number; at: string; channelLabel: string; isEmail: boolean; body: string; ord: number; id: string }
  | {
      kind: "event";
      ms: number;
      at: string;
      text: string;
      tone: "slate" | "rose";
      contextId: number | null;
      ord: number;
      sets: State[];
      clears: State[];
      /** Counts for the state, but is not drawn (before the first shown message). */
      hidden?: boolean;
    };

/**
 * Each outbound HL message → the bot reply row it is, when the text matches
 * (normalized) and the times are within MATCH_WINDOW_MS. The closest row wins,
 * and a row is used once.
 */
export function matchBotMessages(messages: HlMessage[], rows: BotRow[]): Map<string, BotRow> {
  const out = new Map<string, BotRow>();
  const used = new Set<number>();
  const candidates = rows.filter((r) => r.message_type !== "skip" && normText(r.reply_text));
  for (const m of messages) {
    if (m.direction !== "outbound") continue;
    const ms = epoch(m.sent_at);
    const body = normText(m.body);
    if (ms == null || !body) continue;
    let best: BotRow | null = null;
    let bestGap = Infinity;
    for (const r of candidates) {
      if (used.has(r.context_id) || normText(r.reply_text) !== body) continue;
      const rAt = epoch(r.sent_at) ?? epoch(r.generated_at);
      if (rAt == null) continue;
      const gap = Math.abs(ms - rAt);
      if (gap <= MATCH_WINDOW_MS && gap < bestGap) {
        best = r;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.context_id);
      out.set(m.ghl_message_id, best);
    }
  }
  return out;
}

export function buildConversation(input: ConversationInput): ConversationView {
  const { messages, rows, tagEvents, mustReviewScoreBelow } = input;
  const cutoff = threadCutoff(rows, input.cutoverAt);
  const flat: Flat[] = [];
  let ord = 0;

  // 1. Real messages, from the HL mirror. Undated ones cannot be placed and are dropped.
  const shownMessages = messages
    .map((m) => ({ m, ms: epoch(m.sent_at) }))
    .filter((x): x is { m: HlMessage; ms: number } => x.ms != null && (cutoff == null || x.ms >= cutoff))
    .sort((a, b) => a.ms - b.ms);
  const matches = matchBotMessages(
    shownMessages.map((x) => x.m),
    rows,
  );
  const matchedRows = new Set<number>();
  for (const { m, ms } of shownMessages) {
    const label = channelLabel(m.type);
    const isEmail = label === "Email";
    const body = plainText(m.body);
    if (m.direction === "inbound") {
      flat.push({ kind: "lead", ms, at: m.sent_at!, channelLabel: label, body, ord: ord++ });
      continue;
    }
    const row = matches.get(m.ghl_message_id);
    if (row) {
      matchedRows.add(row.context_id);
      flat.push({ kind: "bot", ms, at: m.sent_at!, channelLabel: label, isEmail, body, row, matched: true, notSent: false, ord: ord++ });
    } else {
      flat.push({ kind: "other_outbound", ms, at: m.sent_at!, channelLabel: label, isEmail, body, ord: ord++, id: m.ghl_message_id });
    }
  }

  // 2. Bot rows the mirror does not show are still reviewable, so they stay.
  for (const r of rows) {
    if (r.message_type === "skip" || matchedRows.has(r.context_id)) continue;
    const at = r.sent_at ?? r.generated_at;
    const ms = epoch(at);
    if (ms == null) continue;
    flat.push({
      kind: "bot",
      ms,
      at,
      channelLabel: rowChannelLabel(r.channel),
      isEmail: r.channel === "email",
      body: r.reply_text ?? "",
      row: r,
      matched: false,
      notSent: !r.sent_at,
      ord: ord++,
    });
  }

  // 3. Skips are quiet lines, still clickable to review.
  for (const r of rows) {
    if (r.message_type !== "skip") continue;
    const ms = epoch(r.generated_at);
    if (ms == null) continue;
    flat.push({
      kind: "event",
      ms,
      at: r.generated_at,
      text: `Bot didn't reply · ${skipReasonLabel(r.skip_reason)}`,
      tone: "slate",
      contextId: r.context_id,
      sets: [],
      clears: [],
      ord: ord++,
    });
  }

  // 4. Tag changes. One before the first shown message is not drawn — a line
  //    with no message before it to explain is noise in a review — but it
  //    still counts: a pause from last week is still a pause today.
  const firstMessageMs = flat.filter((f) => f.kind !== "event").reduce((min, f) => Math.min(min, f.ms), Infinity);
  const tagLines = tagEvents
    .map((e) => ({ e, ms: epoch(e.at), line: tagLine(e) }))
    .filter((x): x is { e: TagEvent; ms: number; line: TagLine } => x.ms != null && x.line != null)
    .sort((a, b) => a.ms - b.ms);
  let group: typeof tagLines = [];
  const flushGroup = () => {
    if (!group.length) return;
    const texts = [...new Set(group.map((g) => g.line.text))];
    const sets = [...new Set(group.flatMap((g) => (g.line.state ? [g.line.state] : [])))];
    const clears = [...new Set(group.flatMap((g) => (g.line.clears ? [g.line.clears] : [])))];
    flat.push({
      kind: "event",
      ms: group[0]!.ms,
      at: group[0]!.e.at,
      text: texts.join(" · "),
      tone: sets.includes("opted_out") ? "rose" : "slate",
      contextId: null,
      sets,
      clears,
      hidden: group[0]!.ms < firstMessageMs || (cutoff != null && group[0]!.ms < cutoff),
      ord: ord++,
    });
    group = [];
  };
  for (const t of tagLines) {
    const prev = group[group.length - 1];
    if (prev && t.ms - prev.ms > TAG_COLLAPSE_MS) flushGroup();
    group.push(t);
  }
  flushGroup();

  // 5. Real time only. On an equal instant a message sorts before an event.
  flat.sort((a, b) => a.ms - b.ms || Number(a.kind === "event") - Number(b.kind === "event") || a.ord - b.ord);

  // 6. Issue chips: which state was active when each outbound went out.
  const active = new Set<State>();
  const issuesFor = new Map<Flat, Issue[]>();
  const anchorOf = (f: Flat) =>
    f.kind === "bot" ? `msg-c${f.row.context_id}` : f.kind === "other_outbound" ? `msg-g${f.id}` : "";
  for (const f of flat) {
    if (f.kind === "event") {
      f.clears.forEach((s) => active.delete(s));
      f.sets.forEach((s) => active.add(s));
      continue;
    }
    if (f.kind === "lead") continue;
    const chips: Issue[] = [];
    const order = f.kind === "bot" ? BOT_STATE_ORDER : OTHER_STATE_ORDER;
    const state = order.find((s) => active.has(s));
    if (state) chips.push({ label: STATE_CHIP[state], tone: state === "opted_out" ? "rose" : "amber", anchor: anchorOf(f) });
    if (f.kind === "bot" && f.row.ai_score != null && f.row.ai_score < mustReviewScoreBelow) {
      chips.push({ label: `AI score ${Math.round(f.row.ai_score)}`, tone: "amber", anchor: anchorOf(f) });
    }
    issuesFor.set(f, chips);
  }

  // 7. Sessions and day dividers. A lead message attaches to the session it
  //    precedes: when the next outbound after it opens a new session, the
  //    header goes above the lead, and any event lines between the lead and
  //    that reply move above it, so a reply always sits under what it answered.
  const drawn = flat.filter((f) => !(f.kind === "event" && f.hidden));
  const runKey = (f: Flat): string | null =>
    f.kind === "bot"
      ? `bot|${friendlyRuleName(f.row.rule_applied, f.row.workflow_code)}`
      : f.kind === "other_outbound"
        ? "other"
        : null;

  const ordered: Array<Flat | { kind: "header"; runKey: string; first: Flat }> = [];
  let currentRun: string | null = null;
  let currentDay: string | null = null;
  const dayOf = (f: Flat) => dateKeyEt(f.ms);

  for (let i = 0; i < drawn.length; i++) {
    const f = drawn[i]!;
    const rk = runKey(f);
    if (f.kind === "lead") {
      // Look past event lines for the outbound this lead message leads into.
      let j = i + 1;
      while (j < drawn.length && drawn[j]!.kind === "event") j++;
      const next = drawn[j];
      const nextRun = next ? runKey(next) : null;
      if (next && nextRun && (nextRun !== currentRun || dayOf(next) !== currentDay) && dayOf(next) === dayOf(f)) {
        for (let k = i + 1; k < j; k++) ordered.push(drawn[k]!);
        ordered.push({ kind: "header", runKey: nextRun, first: next });
        ordered.push(f);
        ordered.push(next);
        currentRun = nextRun;
        currentDay = dayOf(next);
        i = j;
        continue;
      }
      ordered.push(f);
      continue;
    }
    if (rk && (rk !== currentRun || dayOf(f) !== currentDay)) {
      ordered.push({ kind: "header", runKey: rk, first: f });
      currentRun = rk;
      currentDay = dayOf(f);
    }
    ordered.push(f);
  }

  // Count each header's outbound messages, up to the next header.
  const counts = new Map<number, number>();
  let lastHeader = -1;
  ordered.forEach((o, idx) => {
    if (o.kind === "header") {
      lastHeader = idx;
      counts.set(idx, 0);
    } else if ((o.kind === "bot" || o.kind === "other_outbound") && lastHeader >= 0) {
      counts.set(lastHeader, (counts.get(lastHeader) ?? 0) + 1);
    }
  });

  const items: ConvItem[] = [];
  const allIssues: Issue[] = [];
  let shownDay: string | null = null;
  let lastLead: string | null = null;
  ordered.forEach((o, idx) => {
    const ms = o.kind === "header" ? o.first.ms : o.ms;
    const d = dateKeyEt(ms);
    if (shownDay == null || d > shownDay) {
      shownDay = d;
      const iso = new Date(ms).toISOString();
      items.push({ kind: "day", key: `d:${d}`, label: dayEt(iso) });
    }
    if (o.kind === "header") {
      const sender = o.runKey === "other" ? "other" : "bot";
      items.push({
        kind: "session",
        key: `s:${idx}`,
        sender,
        label: sender === "other" ? "GHL workflow / team" : `Agentic bot · ${o.runKey.slice(4)}`,
        count: counts.get(idx) ?? 0,
        startAt: o.first.at,
      });
      return;
    }
    if (o.kind === "lead") {
      lastLead = o.body;
      items.push({ kind: "lead", key: `l:${o.ord}`, at: o.at, channelLabel: o.channelLabel, body: o.body });
      return;
    }
    if (o.kind === "event") {
      items.push({ kind: "event", key: `e:${o.ord}`, at: o.at, text: o.text, tone: o.tone, contextId: o.contextId });
      return;
    }
    const issues = issuesFor.get(o) ?? [];
    allIssues.push(...issues);
    if (o.kind === "bot") {
      items.push({
        kind: "bot",
        key: `b:${o.row.context_id}`,
        anchor: anchorOf(o),
        at: o.at,
        channelLabel: o.channelLabel,
        isEmail: o.isEmail,
        body: o.body,
        contextId: o.row.context_id,
        ruleApplied: o.row.rule_applied,
        aiScore: o.row.ai_score,
        replyingTo: lastLead ? clip(lastLead, 40) : null,
        matched: o.matched,
        notSent: o.notSent,
        issues,
      });
    } else {
      items.push({
        kind: "other_outbound",
        key: `o:${o.id}`,
        anchor: anchorOf(o),
        at: o.at,
        channelLabel: o.channelLabel,
        isEmail: o.isEmail,
        body: o.body,
        issues,
      });
    }
  });

  return {
    items,
    issues: allIssues,
    notice: HIDDEN_HISTORY_NOTICE,
    cutoffAt: cutoff != null ? new Date(cutoff).toISOString() : null,
    stateEvents: flat
      .filter((f): f is Extract<Flat, { kind: "event" }> => f.kind === "event" && f.contextId == null)
      .map((f) => ({ at: f.at, text: f.text })),
  };
}

// ─── "Why this is here" ──────────────────────────────────────────────

/**
 * When `later` happened, said from `from`, in ET: "20 minutes later",
 * "that afternoon", "the next morning", "3 days later".
 */
export function relativeWhen(fromMs: number, laterMs: number, opts: { partOfDayNextDay?: boolean } = {}): string {
  const mins = Math.round((laterMs - fromMs) / 60_000);
  if (mins < 60) return mins <= 1 ? "a minute later" : `${mins} minutes later`;
  const part = (ms: number) => {
    const h = hourEt(ms);
    return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  };
  const a = dateKeyEt(fromMs);
  const b = dateKeyEt(laterMs);
  if (a === b) return `that ${part(laterMs)}`;
  const days = Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
  if (days === 1) return opts.partOfDayNextDay ? `the next ${part(laterMs)}` : "the next day";
  return `${days} days later`;
}

export type WhyInput = {
  firstName: string;
  /** v_bot_review_queue.must_review_cause of the message under review. */
  cause: string | null;
  /** The message under review: its time and AI score. */
  flaggedAt: string | null;
  flaggedScore: number | null;
  optedOutAt: string | null;
  view: ConversationView;
};

function describeOutbound(item: Extract<ConvItem, { kind: "bot" | "other_outbound" }>): string {
  if (item.kind === "bot") return "an AI reply";
  if (item.isEmail) return "a workflow email";
  if (item.channelLabel === "SMS") return "a workflow text";
  return "a workflow message";
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The deterministic summary at the top of the thread (handoff §3).
 *
 * Example (Charles Jessup): "Charles opted out the next morning. The bot told
 * Charles the address is outside our service area (AI score 10), then messages
 * kept going out: an AI reply 20 minutes later, a workflow email that afternoon
 * and a workflow text the next day."
 */
export function buildWhyText(w: WhyInput): string {
  const name = w.firstName.trim() || "The lead";
  const sentences: string[] = [];
  const flaggedMs = epoch(w.flaggedAt);
  const optMs = epoch(w.optedOutAt);

  if (w.cause === "Opted out after") {
    sentences.push(
      flaggedMs != null && optMs != null
        ? `${name} opted out ${relativeWhen(flaggedMs, optMs, { partOfDayNextDay: true })}.`
        : `${name} opted out after a bot message.`,
    );
  } else if (w.cause === "Bot stayed silent") {
    sentences.push(`The bot didn't reply to ${name}.`);
  } else if (w.cause === "Low AI score") {
    sentences.push(
      w.flaggedScore != null ? `The AI judge scored a bot message ${Math.round(w.flaggedScore)}.` : "The AI judge scored a bot message low.",
    );
  } else if (w.cause === "Bot stopped after") {
    sentences.push(`Someone stopped the bot for ${name} after a bot message.`);
  }

  // The first stop-type state, and what went out after it.
  const items = w.view.items;
  const firstFlagged = items.findIndex(
    (i) => (i.kind === "bot" || i.kind === "other_outbound") && i.issues.some((x) => x.label.startsWith("Sent after")),
  );
  if (firstFlagged >= 0) {
    // The state line that opened it: the latest one before the first flagged send.
    const flaggedSendMs = Date.parse((items[firstFlagged] as Extract<ConvItem, { kind: "bot" | "other_outbound" }>).at);
    const STATE_RX = /Marked out of service area|Outbound messages paused|Bot stopped|Opted out/;
    const stateItem =
      [...w.view.stateEvents].reverse().find((e) => Date.parse(e.at) < flaggedSendMs && STATE_RX.test(e.text)) ?? null;
    const stateMs = stateItem ? Date.parse(stateItem.at) : null;
    let lead: string;
    if (stateItem && /Marked out of service area/.test(stateItem.text)) {
      // The bot message the mark followed, for its score.
      const setter =
        [...items]
          .reverse()
          .find((it): it is Extract<ConvItem, { kind: "bot" }> => it.kind === "bot" && Date.parse(it.at) <= stateMs!) ?? null;
      const score = setter?.aiScore != null ? ` (AI score ${Math.round(setter.aiScore)})` : "";
      lead = setter
        ? `The bot told ${name} the address is outside our service area${score}`
        : `${name} was marked out of our service area`;
    } else if (stateItem && /Bot stopped/.test(stateItem.text)) {
      lead = "The bot was stopped";
    } else if (stateItem && /Opted out/.test(stateItem.text)) {
      lead = `${name} opted out`;
    } else {
      lead = "Outbound messages were paused";
    }
    const sent = items
      .slice(firstFlagged)
      .filter(
        (i): i is Extract<ConvItem, { kind: "bot" | "other_outbound" }> =>
          (i.kind === "bot" || i.kind === "other_outbound") && i.issues.some((x) => x.label.startsWith("Sent after")),
      );
    if (sent.length <= 3) {
      const after = sent.map((i) => `${describeOutbound(i)} ${stateMs != null ? relativeWhen(stateMs, Date.parse(i.at)) : "later"}`);
      sentences.push(`${lead}, then messages kept going out: ${joinList(after)}.`);
    } else {
      // A long list reads as noise; the chips below name each one.
      const ai = sent.filter((i) => i.kind === "bot").length;
      const wf = sent.length - ai;
      const parts = [
        ai ? `${ai} AI repl${ai === 1 ? "y" : "ies"}` : "",
        wf ? `${wf} workflow message${wf === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      const last = sent[sent.length - 1]!;
      const until = stateMs != null ? `, the last ${relativeWhen(stateMs, Date.parse(last.at))}` : "";
      sentences.push(`${lead}, then ${sent.length} messages kept going out: ${joinList(parts)}${until}.`);
    }
  }

  const afterOptOut = w.view.issues.filter((i) => i.label === "Sent after opt-out").length;
  if (afterOptOut > 0 && !sentences.some((s) => s.includes("opted out,"))) {
    sentences.push(`${afterOptOut} message${afterOptOut === 1 ? "" : "s"} went out after the opt-out.`);
  }

  if (!sentences.length) sentences.push("Nothing in this conversation stands out. It is here as a sample to spot check.");
  return sentences.join(" ");
}

// ─── Queue chips ─────────────────────────────────────────────────────

/**
 * The issue chips on one queue row, from the contact's bot rows and tag events
 * alone (no HL read per row). Distinct labels, in a fixed order.
 */
export function queueIssueChips(rows: BotRow[], tagEvents: TagEvent[]): string[] {
  const view = buildConversation({
    messages: [],
    rows: rows.map((r) => ({ ...r, ai_score: null })),
    tagEvents,
    cutoverAt: null,
    mustReviewScoreBelow: -Infinity,
  });
  const order = Object.values(STATE_CHIP);
  const labels = new Set(view.issues.map((i) => i.label));
  return order.filter((l) => labels.has(l));
}
