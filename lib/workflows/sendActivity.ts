/**
 * "Is this workflow actually sending?" (2026-09-25). Pure: takes the hourly
 * snapshot (db/migrations/0023, 0024) and answers per message step and per
 * workflow.
 *
 * Two sources, in order of trust:
 *  1. `stamp`   — the workflow stamps `sent:<code>-e<n>|s<n>` right after a
 *                 message; tag additions in the window are exact send counts.
 *  2. `content` — outbound messages whose first characters match the step's
 *                 own text, with merge fields ({{contact.first_name}}) allowed
 *                 to be anything. Good when the text is distinctive.
 * Anything else is `unknown`: an AI-written body ({{chatgpt…}}) has no fixed
 * text, a short or generic head would match half the outbox, and a template
 * reused by several steps cannot be split between them (`ambiguous`).
 *
 * The verdict that matters is `no_sends_seen`, and it has to be EARNED
 * (Mark, 2026-09-25: a false alarm here gets a working workflow switched
 * off). It is given only when all of these hold:
 *   - the workflow is published and has message steps we could measure;
 *   - at least MIN_ENTRIES_TO_JUDGE leads entered in the window — a slow
 *     workflow with three leads in is "too few to judge", not broken;
 *   - the HL copy of GHL was fresh when the snapshot ran and the snapshot
 *     itself is recent — a sync that is behind looks exactly like silence;
 *   - nothing went out.
 * "Could not tell" is `unknown`, never `no_sends_seen`; a workflow nobody
 * entered is `quiet`. Per step, `reach` separates "no one got this far"
 * from "leads got here and nothing went out" — the second is the finding.
 */

export type TagAddition = { tag: string; adds: number; contacts: number };
export type OutboundHead = { type: string; head: string; sends: number; contacts: number };
export type StepHead = { workflow_id: string; step_id: string; step_type: string; head: string | null };
/** One row of dash_workflow_outcomes (0024): what happened in the 14 days after entering `code`. */
export type OutcomeRow = { code: string; entries: number; replied: number; booked: number; opted_out: number };

/** Whether a "nothing went out" reading can be trusted right now. */
export type Freshness = { ok: true } | { ok: false; reason: string };

export type SendActivityRaw =
  | {
      ok: true;
      computedAt: string;
      days: number;
      tags: TagAddition[];
      heads: OutboundHead[];
      stepHeads: StepHead[];
      fresh: Freshness;
      /** Null until migration 0024 has been applied on HL. */
      outcomes: OutcomeRow[] | null;
    }
  | { ok: false; reason: string };

/** Fewer leads in than this and a zero says nothing about the workflow. */
export const MIN_ENTRIES_TO_JUDGE = 20;
/** A snapshot older than this is not evidence of anything. */
export const SNAPSHOT_MAX_AGE_HOURS = 6;
/** The HL copy of GHL must have synced within this long before the snapshot. */
export const SYNC_MAX_AGE_MINUTES = 120;

export type SendBasis = "stamp" | "content" | "ambiguous" | "unknown";
/** Did anyone get as far as this step in the window? */
export type Reach = "reached" | "not_reached" | "beyond_window" | "unknown";
export type StepSends = { sends: number | null; contacts: number | null; basis: SendBasis; note?: string; reach?: Reach };

export type SendVerdict =
  | "sending" // at least one send counted
  | "no_sends_seen" // published, enough leads in, fresh data, nothing went out
  | "too_few_to_judge" // nothing went out, but fewer than MIN_ENTRIES_TO_JUDGE came in
  | "quiet" // nobody entered (or a draft): nothing to judge
  | "unknown"; // could not measure, or the data was not fresh enough to trust a zero

export type WorkflowOutcomes = {
  entries: number;
  replied: number;
  booked: number;
  optedOut: number;
  replyRate: number;
  bookingRate: number;
  optOutRate: number;
};

export type WorkflowSending = {
  sends30d: number | null;
  entries30d: number;
  /** stamp = every counted message is exact; content = matched by text; mixed = both; unknown = could not measure. */
  basis: "stamp" | "content" | "mixed" | "unknown";
  verdict: SendVerdict;
  /** Plain-English reason behind a non-obvious verdict. */
  note?: string;
  computedAt: string;
  days: number;
  /** What happened after leads entered (0024). Null when the migration is not applied or nobody entered. */
  outcomes: WorkflowOutcomes | null;
};

const MERGE_FIELD = /\{\{[^}]*\}\}/g;
const MIN_LITERAL = 30;

/**
 * A step head → anchored regex, or null when the text cannot identify a
 * message: fewer than 30 literal characters once merge fields are removed,
 * or nothing but merge fields (AI-written).
 */
export function fingerprint(head: string | null | undefined): RegExp | null {
  const h = (head ?? "").trim().toLowerCase().slice(0, 160);
  if (!h) return null;
  const literal = h.replace(MERGE_FIELD, "").replace(/\s+/g, " ").trim();
  if (literal.length < MIN_LITERAL) return null;
  const parts = h.split(MERGE_FIELD).map((p) =>
    p
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+")
      .trim(),
  );
  const src = parts.filter(Boolean).join(".{0,60}?");
  return new RegExp(`^\\s*${src}`, "s");
}

const typeOf = (stepType: string) => (stepType === "email" ? "3" : "2");

/** Content matches for every step head. A head claimed by several steps is ambiguous for all of them. */
export function matchStepSends(stepHeads: readonly StepHead[], outbound: readonly OutboundHead[]): Map<string, StepSends> {
  const out = new Map<string, StepSends>();
  const claims = new Map<string, string[]>(); // outbound head key → step ids
  const perStep = new Map<string, { sends: number; contacts: number; keys: string[] }>();
  const byType = new Map<string, OutboundHead[]>();
  for (const o of outbound) byType.set(o.type, [...(byType.get(o.type) ?? []), o]);

  for (const s of stepHeads) {
    const re = fingerprint(s.head);
    if (!re) {
      out.set(s.step_id, { sends: null, contacts: null, basis: "unknown", note: s.head?.includes("{{") ? "written at send time — no fixed text to count" : "text too short to identify" });
      continue;
    }
    const acc = { sends: 0, contacts: 0, keys: [] as string[] };
    for (const o of byType.get(typeOf(s.step_type)) ?? []) {
      if (!re.test(o.head)) continue;
      acc.sends += o.sends;
      acc.contacts += o.contacts;
      const key = `${o.type}|${o.head}`;
      acc.keys.push(key);
      claims.set(key, [...(claims.get(key) ?? []), s.step_id]);
    }
    perStep.set(s.step_id, acc);
  }
  for (const [stepId, acc] of perStep) {
    const shared = acc.keys.some((k) => new Set(claims.get(k) ?? []).size > 1);
    out.set(stepId, shared
      ? { sends: acc.sends, contacts: acc.contacts, basis: "ambiguous", note: "same text as another step — counts may include its sends" }
      : { sends: acc.sends, contacts: acc.contacts, basis: "content" });
  }
  return out;
}

/** Tag additions for `sent:<code>-<e|s><n>` across every spelling of the code. */
export function stampSends(
  tags: readonly TagAddition[],
  codes: readonly string[],
  rows: readonly { stepId: string; type: "sms" | "email"; n: number; stamped: boolean }[],
): Map<string, StepSends> {
  const byTag = new Map(tags.map((t) => [t.tag.toLowerCase(), t]));
  const out = new Map<string, StepSends>();
  // Two branches can stamp the same number (S2.2 has an "SMS 1" with and
  // without an email); the count is then the pair's total, and says so.
  const dup = new Map<string, number>();
  for (const r of rows) if (r.stamped) dup.set(`${r.type}${r.n}`, (dup.get(`${r.type}${r.n}`) ?? 0) + 1);
  for (const r of rows) {
    if (!r.stamped) continue;
    let sends = 0;
    let contacts = 0;
    for (const c of codes) {
      const t = byTag.get(`sent:${c.toLowerCase()}-${r.type === "email" ? "e" : "s"}${r.n}`);
      if (t) {
        sends += t.adds;
        contacts += t.contacts;
      }
    }
    out.set(r.stepId, (dup.get(`${r.type}${r.n}`) ?? 1) > 1 ? { sends, contacts, basis: "stamp", note: "stamp shared with another branch — total for both" } : { sends, contacts, basis: "stamp" });
  }
  return out;
}

/** Contacts that entered (got `active-<code>`) in the window. */
export function entries(tags: readonly TagAddition[], codes: readonly string[]): number {
  let n = 0;
  for (const t of tags) {
    const tag = t.tag.toLowerCase();
    if (codes.some((c) => tag === `active-${c.toLowerCase()}`)) n += t.contacts;
  }
  return n;
}

/** Sum of stamp additions for any `sent:<code>-*` (index-level, no graph needed). */
export function stampTotal(tags: readonly TagAddition[], codes: readonly string[]): { sends: number; stamps: number } {
  let sends = 0;
  let stamps = 0;
  for (const t of tags) {
    const tag = t.tag.toLowerCase();
    if (codes.some((c) => tag.startsWith(`sent:${c.toLowerCase()}-`))) {
      sends += t.adds;
      stamps++;
    }
  }
  return { sends, stamps };
}

/** Reply / booking / opt-out counts for a workflow's codes, or null when there is nothing to sum. */
export function outcomesFor(rows: readonly OutcomeRow[] | null, codes: readonly string[]): WorkflowOutcomes | null {
  if (!rows) return null;
  const want = new Set(codes.map((c) => c.toLowerCase()));
  let entriesN = 0;
  let replied = 0;
  let booked = 0;
  let optedOut = 0;
  for (const r of rows) {
    if (!want.has(r.code.toLowerCase())) continue;
    entriesN += r.entries;
    replied += r.replied;
    booked += r.booked;
    optedOut += r.opted_out;
  }
  if (entriesN === 0) return null;
  return { entries: entriesN, replied, booked, optedOut, replyRate: replied / entriesN, bookingRate: booked / entriesN, optOutRate: optedOut / entriesN };
}

/**
 * Snapshot + sync freshness, decided once in the loader. `snapshotAt` is when
 * the hourly job ran; `lastSyncAt` is the older of the messages and contacts
 * syncs at that moment (null = could not read it).
 */
export function freshness(snapshotAt: string, lastSyncAt: string | null, now: Date = new Date()): Freshness {
  const snapMs = Date.parse(snapshotAt);
  if (Number.isNaN(snapMs)) return { ok: false, reason: "snapshot time unreadable" };
  const ageH = (now.getTime() - snapMs) / 3_600_000;
  if (ageH > SNAPSHOT_MAX_AGE_HOURS) return { ok: false, reason: `snapshot is ${Math.round(ageH)} h old — the hourly job has not run` };
  if (lastSyncAt === null) return { ok: false, reason: "could not read when GHL was last copied to HL" };
  const syncMs = Date.parse(lastSyncAt);
  if (Number.isNaN(syncMs)) return { ok: false, reason: "sync time unreadable" };
  const behindMin = (snapMs - syncMs) / 60_000;
  if (behindMin > SYNC_MAX_AGE_MINUTES) return { ok: false, reason: `HL's copy of GHL was ${Math.round(behindMin / 60)} h behind when the snapshot ran` };
  return { ok: true };
}

/**
 * Workflow-level verdict. Stamp evidence wins; else content matches over the
 * workflow's own steps. Unknown when nothing could be measured, or when a
 * zero cannot be trusted (stale sync or snapshot).
 */
export function summarizeWorkflow(input: {
  status: "published" | "draft" | "unknown";
  messageSteps: number;
  codes: readonly string[];
  stepIds: readonly string[];
  raw: SendActivityRaw;
  contentByStep: ReadonlyMap<string, StepSends>;
}): WorkflowSending | null {
  const { raw } = input;
  if (!raw.ok) return null;
  const st = stampTotal(raw.tags, input.codes);
  const entered = entries(raw.tags, input.codes);
  let content = 0;
  let known = 0;
  for (const id of input.stepIds) {
    const c = input.contentByStep.get(id);
    if (!c) continue;
    if (c.basis === "content" || c.basis === "ambiguous") {
      known++;
      content += c.sends ?? 0;
    }
  }
  const base = { entries30d: entered, computedAt: raw.computedAt, days: raw.days, outcomes: outcomesFor(raw.outcomes, input.codes) };
  if (input.messageSteps === 0) return { ...base, sends30d: 0, basis: "unknown", verdict: "quiet", note: "sends no messages" };

  const basis: WorkflowSending["basis"] = st.stamps > 0 && known > 0 ? "mixed" : st.stamps > 0 ? "stamp" : known > 0 ? "content" : "unknown";
  if (basis === "unknown") return { ...base, sends30d: null, basis, verdict: "unknown", note: "messages are written at send time or too short to identify" };
  const total = st.sends + content;
  if (total > 0) return { ...base, sends30d: total, basis, verdict: "sending" };
  if (input.status !== "published") return { ...base, sends30d: 0, basis, verdict: "quiet", note: "not published" };
  if (entered === 0) return { ...base, sends30d: 0, basis, verdict: "quiet", note: "no leads entered" };
  if (!raw.fresh.ok) return { ...base, sends30d: 0, basis, verdict: "unknown", note: raw.fresh.reason };
  if (entered < MIN_ENTRIES_TO_JUDGE) return { ...base, sends30d: 0, basis, verdict: "too_few_to_judge", note: `${entered} leads in — fewer than ${MIN_ENTRIES_TO_JUDGE}, too few to judge` };
  return { ...base, sends30d: 0, basis, verdict: "no_sends_seen" };
}

/** Steps first by stamp, then content, then unknown. */
export function mergeStepSends(stamp: ReadonlyMap<string, StepSends>, content: ReadonlyMap<string, StepSends>, stepIds: readonly string[]): Map<string, StepSends> {
  const out = new Map<string, StepSends>();
  for (const id of stepIds) {
    out.set(id, stamp.get(id) ?? content.get(id) ?? { sends: null, contacts: null, basis: "unknown" });
  }
  return out;
}

/**
 * Did anyone get as far as each step? Walks the schedule in send order; a
 * step is "reached" when the nearest earlier message on its path went out,
 * "not_reached" when that message counted zero (or nobody entered), and
 * "beyond_window" when it sits later than the window is long, so a lead who
 * entered this month cannot have got there yet. `entered` null = the
 * workflow has no tag code, so entries are unknowable.
 */
export function annotateReach(
  schedule: readonly { stepId: string; branchPath: readonly string[]; day: number }[],
  sends: ReadonlyMap<string, StepSends>,
  entered: number | null,
  days: number,
): Map<string, StepSends> {
  const out = new Map<string, StepSends>();
  const seen: { stepId: string; branchPath: readonly string[] }[] = [];
  const onPath = (prev: readonly string[], cur: readonly string[]) => prev.length <= cur.length && prev.every((p, i) => cur[i] === p);
  for (const row of schedule) {
    const s = sends.get(row.stepId) ?? { sends: null, contacts: null, basis: "unknown" as const };
    let reach: Reach;
    const prev = [...seen].reverse().find((p) => onPath(p.branchPath, row.branchPath));
    if (row.day > days) reach = "beyond_window";
    else if (!prev) reach = entered === null ? "unknown" : entered > 0 ? "reached" : "not_reached";
    else {
      const ps = sends.get(prev.stepId)?.sends ?? null;
      reach = ps === null ? "unknown" : ps > 0 ? "reached" : "not_reached";
    }
    out.set(row.stepId, { ...s, reach });
    seen.push(row);
  }
  // Steps outside the linear schedule keep their counts, reach unknown.
  for (const [id, s] of sends) if (!out.has(id)) out.set(id, { ...s, reach: "unknown" });
  return out;
}

/** Plain words for a step's send count, given what we know about reach. */
export function stepSendsWords(s: StepSends | undefined, days = 30): { text: string; tone: "ok" | "none" | "unknown" } | null {
  if (!s) return null;
  if (s.sends === null) return { text: "sends unknown", tone: "unknown" };
  if (s.sends > 0) return { text: `${s.sends.toLocaleString()} sent · ${days} d${s.basis === "stamp" ? "" : " ≈"}`, tone: "ok" };
  switch (s.reach) {
    case "not_reached":
      return { text: "no one reached this step", tone: "unknown" };
    case "beyond_window":
      return { text: `day ${days}+ — outside the window`, tone: "unknown" };
    case "reached":
      return { text: "reached, no sends seen", tone: "none" };
    default:
      return { text: "no sends seen", tone: "none" };
  }
}
