/**
 * GHL tag grammar — the journey's encoding of CURRENT STATE.
 *
 * Tags are the enrollment record, not `workflow_executions`: that table is fed
 * by a tag-diff webhook for only ~25 workflows plus backfills (verified
 * 2026-09-24), so it cannot say who is in a workflow. `lead_events`
 * `contact_updated` rows carry the full tag snapshot at every change, and
 * diffing consecutive snapshots reconstructs entries, exits, sends and stage
 * moves. Everything here is pure so it unit-tests without Supabase.
 */
import type { BotState } from "./types";

export type BotTag =
  | "agentic-active"
  | "stop-bot"
  | "dnc"
  | "dnc-sms"
  | "do-not-contact"
  | "stage:dnc"
  | "unsubscribed";

export type ParsedTag =
  /** active-s2.2 → "S2.2" (uppercase; legacy w9.0 stays "W9.0" — the registry maps it). */
  | { kind: "active_workflow"; code: string }
  | { kind: "sent"; code: string; channel: "email" | "sms"; n: number }
  | { kind: "stage"; value: string }
  /** entry:x (permanent attribution) vs active-entry:x (current lane). */
  | { kind: "entry"; value: string; active: boolean }
  | { kind: "source"; value: string }
  | { kind: "lp_route"; value: string }
  /** lp-lead-issued, lp-lead-confirmed … — LP status mirrored into GHL. */
  | { kind: "lp_status"; value: string }
  | { kind: "bot"; value: BotTag }
  | { kind: "other"; value: string };

const BOT_TAGS = new Set<BotTag>([
  "agentic-active",
  "stop-bot",
  "dnc",
  "dnc-sms",
  "do-not-contact",
  "stage:dnc",
  "unsubscribed",
]);

/** The consent family. Any one of them outranks everything else. */
export const DNC_TAGS: readonly string[] = [
  "dnc",
  "dnc-sms",
  "do-not-contact",
  "stage:dnc",
  "unsubscribed",
];

/**
 * Tags that pause NURTURE only. Per the always-respond policy they never
 * block a direct reply to an inbound message — the UI says so in a tooltip.
 */
export const PAUSE_TAGS: readonly string[] = [
  "suppress-outbound",
  "cooling-active",
  "hard-disqualified",
  "quarantined",
];

const ACTIVE_RE = /^active-([a-z]\d*(?:\.\d+)?)$/i;
const SENT_RE = /^sent:([a-z]\d*(?:\.\d+)?)-(e|s)(\d+)$/i;
const STAGE_RE = /^stage:(.+)$/i;
const ENTRY_RE = /^(active-)?entry:(.+)$/i;
const SOURCE_RE = /^source:(.+)$/i;
const LP_ROUTE_RE = /^lp-route:(.+)$/i;
const LP_STATUS_RE = /^lp-lead-(.+)$/i;

export function parseTag(tag: string): ParsedTag {
  const t = tag.trim();
  const lower = t.toLowerCase();
  // Bot / consent first: `stage:dnc` would otherwise read as a funnel stage.
  if (BOT_TAGS.has(lower as BotTag)) return { kind: "bot", value: lower as BotTag };

  let m = ACTIVE_RE.exec(t);
  if (m?.[1]) return { kind: "active_workflow", code: m[1].toUpperCase() };

  m = SENT_RE.exec(t);
  if (m?.[1] && m[2] && m[3]) {
    return {
      kind: "sent",
      code: m[1].toUpperCase(),
      channel: m[2].toLowerCase() === "e" ? "email" : "sms",
      n: Number(m[3]),
    };
  }

  m = ENTRY_RE.exec(t);
  if (m?.[2]) return { kind: "entry", value: m[2], active: Boolean(m[1]) };

  m = STAGE_RE.exec(t);
  if (m?.[1]) return { kind: "stage", value: m[1] };

  m = SOURCE_RE.exec(t);
  if (m?.[1]) return { kind: "source", value: m[1] };

  m = LP_ROUTE_RE.exec(t);
  if (m?.[1]) return { kind: "lp_route", value: m[1] };

  m = LP_STATUS_RE.exec(t);
  if (m?.[1]) return { kind: "lp_status", value: m[1] };

  return { kind: "other", value: t };
}

/** Set difference both ways. Order follows the snapshot the tag came from. */
export function diffTagSnapshots(
  prev: readonly string[],
  next: readonly string[],
): { added: string[]; removed: string[] } {
  const p = new Set(prev);
  const n = new Set(next);
  return {
    added: next.filter((t) => !p.has(t)),
    removed: prev.filter((t) => !n.has(t)),
  };
}

/** Precedence: DNC family > stop-bot > agentic-active > none. */
export function botState(tags: readonly string[]): BotState {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  if (DNC_TAGS.some((t) => set.has(t))) return "dnc";
  if (set.has("stop-bot")) return "stopped";
  if (set.has("agentic-active")) return "active";
  return "none";
}

/** Why automation is not sending — null when nothing suppresses it. */
export function suppressionFor(
  tags: readonly string[],
): { kind: "stopped" | "paused"; reason: string } | null {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  const dnc = DNC_TAGS.find((t) => set.has(t));
  if (dnc) return { kind: "stopped", reason: dnc };
  if (set.has("stop-bot")) return { kind: "stopped", reason: "stop-bot" };
  const pause = PAUSE_TAGS.find((t) => set.has(t));
  if (pause) return { kind: "paused", reason: pause };
  return null;
}

/** Codes of every `active-<code>` tag, uppercased, in tag order. */
export function activeWorkflowCodes(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind === "active_workflow" && !out.includes(p.code)) out.push(p.code);
  }
  return out;
}

/**
 * The furthest send the contact has had in one workflow, per channel. `sent:`
 * tags number emails and SMS separately (e1, e2 … / s1, s2 …), so position is
 * two numbers, not one.
 */
export function sentPosition(
  tags: readonly string[],
  codes: readonly string[],
): { email: number; sms: number; lastTag: string | null } {
  const want = new Set(codes.map((c) => c.toUpperCase()));
  let email = 0;
  let sms = 0;
  let lastTag: string | null = null;
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind !== "sent" || !want.has(p.code)) continue;
    if (p.channel === "email" && p.n > email) email = p.n;
    if (p.channel === "sms" && p.n > sms) sms = p.n;
    lastTag = t;
  }
  return { email, sms, lastTag };
}

export function stageTag(tags: readonly string[]): string | null {
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind === "stage") return p.value;
  }
  return null;
}

/** Current lane (`active-entry:x`) wins over permanent attribution (`entry:x`). */
export function entryLane(tags: readonly string[]): string | null {
  let permanent: string | null = null;
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind === "entry") {
      if (p.active) return p.value;
      permanent ??= p.value;
    }
  }
  return permanent;
}

export function lpRoute(tags: readonly string[]): string | null {
  // Several lp-route:* can coexist (stale ones are not always removed); the
  // LAST one in the snapshot is the most recently added.
  let route: string | null = null;
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind === "lp_route") route = p.value;
  }
  return route;
}

/** "appt-confirmed" → "appt confirmed". Tags are kebab-case; people aren't. */
export function humanizeTagValue(v: string): string {
  return v.replace(/[-_]+/g, " ").trim();
}

// ── Registry mapping ──────────────────────────────────────────────────────

export type RegistryEntry = {
  canonical_code: string | null;
  canonical_name: string | null;
  legacy_name: string | null;
  /** This IS the GHL workflow id — the registry has no separate column. */
  workflow_id: string | null;
};

/**
 * Tag code → registry row. Canonical codes match directly (`S2.2`). Legacy
 * codes still live on older contacts (`active-w9.0`), and the registry keeps
 * them only inside `legacy_name` ("W9.0 - Objection Handler", sometimes with a
 * leading `*`), so fall back to a prefix match there.
 */
export function resolveWorkflowCode(
  code: string,
  registry: readonly RegistryEntry[],
): RegistryEntry | null {
  const want = code.toUpperCase();
  const direct = registry.find((r) => (r.canonical_code ?? "").toUpperCase() === want);
  if (direct) return direct;
  const legacy = registry.find((r) => {
    const name = (r.legacy_name ?? "").replace(/^\*+/, "").trim().toUpperCase();
    return name === want || name.startsWith(`${want} `) || name.startsWith(`${want}-`);
  });
  if (legacy) return legacy;
  // Some workflows stamp the legacy code without its dot: E.4 adds
  // `active-w04` while its registry row says "W0.4". Compare dotless last.
  const bare = want.replace(/\./g, "");
  return (
    registry.find((r) => codesFor(r).some((c) => c.replace(/\./g, "") === bare)) ?? null
  );
}

/** Every tag code that means this registry row (canonical + legacy). */
export function codesFor(entry: RegistryEntry): string[] {
  const out: string[] = [];
  if (entry.canonical_code) out.push(entry.canonical_code.toUpperCase());
  const legacy = /^\*?\s*([A-Z]\d*(?:\.\d+)?)\b/i.exec(entry.legacy_name ?? "");
  if (legacy?.[1]) {
    const c = legacy[1].toUpperCase();
    if (!out.includes(c)) out.push(c);
    // The dotless spelling some workflows stamp (`active-w04` for W0.4).
    const bare = c.replace(/\./g, "");
    if (bare !== c && !out.includes(bare)) out.push(bare);
  }
  return out;
}
