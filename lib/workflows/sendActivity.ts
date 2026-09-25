/**
 * "Is this workflow actually sending?" (2026-09-25). Pure: takes the hourly
 * snapshot (db/migrations/0023) and answers per message step and per workflow.
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
 * The one rule that matters: `silent` is true ONLY when we measured, leads
 * came in, and nothing went out. "Could not tell" is null, never "silent",
 * and a workflow nobody entered this month is quiet, not broken — a
 * workflow flagged silent gets switched off, so the flag has to be earned.
 */

export type TagAddition = { tag: string; adds: number; contacts: number };
export type OutboundHead = { type: string; head: string; sends: number; contacts: number };
export type StepHead = { workflow_id: string; step_id: string; step_type: string; head: string | null };

export type SendActivityRaw =
  | { ok: true; computedAt: string; days: number; tags: TagAddition[]; heads: OutboundHead[]; stepHeads: StepHead[] }
  | { ok: false; reason: string };

export type SendBasis = "stamp" | "content" | "ambiguous" | "unknown";
export type StepSends = { sends: number | null; contacts: number | null; basis: SendBasis; note?: string };
export type WorkflowSending = {
  sends30d: number | null;
  entries30d: number;
  /** stamp = every counted message is exact; content = matched by text; mixed = both; unknown = could not measure. */
  basis: "stamp" | "content" | "mixed" | "unknown";
  /** Published, sends messages on paper, measured, nothing went out. Null = could not tell. */
  silent: boolean | null;
  computedAt: string;
  days: number;
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

/**
 * Workflow-level verdict. Stamp evidence wins; else content matches over the
 * workflow's own steps. Unknown when nothing could be measured.
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
  let measured = 0;
  let known = 0;
  for (const id of input.stepIds) {
    const c = input.contentByStep.get(id);
    if (!c) continue;
    measured++;
    if (c.basis === "content" || c.basis === "ambiguous") {
      known++;
      content += c.sends ?? 0;
    }
  }
  const base = { entries30d: entered, computedAt: raw.computedAt, days: raw.days };
  if (input.messageSteps === 0) return { ...base, sends30d: 0, basis: "unknown", silent: null };
  if (st.stamps > 0 && known > 0) return { ...base, sends30d: st.sends + content, basis: "mixed", silent: false };
  if (st.stamps > 0) return { ...base, sends30d: st.sends, basis: "stamp", silent: false };
  if (known > 0) {
    return { ...base, sends30d: content, basis: "content", silent: input.status === "published" && content === 0 && entered > 0 };
  }
  void measured;
  return { ...base, sends30d: null, basis: "unknown", silent: null };
}

/** Steps first by stamp, then content, then unknown. */
export function mergeStepSends(stamp: ReadonlyMap<string, StepSends>, content: ReadonlyMap<string, StepSends>, stepIds: readonly string[]): Map<string, StepSends> {
  const out = new Map<string, StepSends>();
  for (const id of stepIds) {
    out.set(id, stamp.get(id) ?? content.get(id) ?? { sends: null, contacts: null, basis: "unknown" });
  }
  return out;
}
