/**
 * "What happens next" — projected sends for one contact (spec §B6).
 *
 * GHL exposes no scheduled-send API, so this reads the workflow's step graph
 * and walks forward from the contact's last send. Every row it returns is
 * labelled `projected` and none is ever dated in the past. It is right most of
 * the time and says so when it is not sure ("depends on: <branch>").
 *
 * Pure: the caller supplies tags, tag-snapshot history and the graph.
 */
import type { JourneyEvent } from "./types";
import { parseTag, sentPosition, suppressionFor } from "./tags";
import { linearizeSchedule, previewText, tagsAddedBy, walkSchedule, type WorkflowGraph } from "./workflowGraph";

export type TagSnapshot = { ts: string; tags: readonly string[] };

const MAX_MESSAGES = 5;
const MAX_MINUTES = 30 * 1440;

/**
 * When did the contact's CURRENT run of `tag` start? The first snapshot of the
 * latest unbroken stretch that carries it. Null when the latest snapshot does
 * not carry it (or there is no history). `snapshots` may be in any order.
 */
export function tagRunStart(snapshots: readonly TagSnapshot[], tag: string): string | null {
  const sorted = [...snapshots].sort((a, b) => a.ts.localeCompare(b.ts));
  let start: string | null = null;
  for (const s of sorted) {
    if (s.tags.includes(tag)) start ??= s.ts;
    else start = null;
  }
  return start;
}

/**
 * The anchor a projection counts from: the most recent `sent:<code>-…` tag
 * (the contact's last send in this workflow) and when it appeared; else the
 * `active-<code>` tag's arrival (the contact has had no sends yet).
 */
export function projectionAnchor(
  tags: readonly string[],
  snapshots: readonly TagSnapshot[],
  codes: readonly string[],
): { tag: string | null; ts: string } | null {
  const want = new Set(codes.map((c) => c.toUpperCase()));
  let best: { tag: string; ts: string } | null = null;
  const pos = sentPosition(tags, codes);
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind !== "sent" || !want.has(p.code)) continue;
    // Only the furthest send per channel can be the latest one.
    if (p.n !== (p.channel === "email" ? pos.email : pos.sms)) continue;
    const ts = tagRunStart(snapshots, t);
    if (ts && (!best || ts > best.ts)) best = { tag: t, ts };
  }
  if (best) return best;
  for (const t of tags) {
    const p = parseTag(t);
    if (p.kind === "active_workflow" && want.has(p.code)) {
      const ts = tagRunStart(snapshots, t);
      if (ts) return { tag: null, ts };
    }
  }
  return null;
}

export type ProjectionInput = {
  tags: readonly string[];
  hasEmail?: boolean;
  hasPhone?: boolean;
  /** Canonical code for titles ("E.4"). */
  code: string;
  /** Every tag spelling of the workflow's code (canonical, legacy, dotless). */
  codes: readonly string[];
  graph: WorkflowGraph;
  anchor: { tag: string | null; ts: string } | null;
  now: Date;
};

/**
 * Projected sends, ascending. Empty when automation is stopped or paused
 * (the card says why), when there is no anchor, or when the last send cannot
 * be located in the graph.
 */
export function projectNext(input: ProjectionInput): JourneyEvent[] {
  if (suppressionFor(input.tags)) return [];
  if (!input.anchor) return [];

  const facts = { tags: input.tags, hasEmail: input.hasEmail, hasPhone: input.hasPhone };
  // The contact as they were on ENTRY: none of the tags this workflow stamps.
  const stamped = tagsAddedBy(input.graph);
  const entryFacts = { ...facts, tags: input.tags.filter((t) => !stamped.has(t.toLowerCase())) };

  let startId: string | undefined;
  if (input.anchor.tag) {
    const p = parseTag(input.anchor.tag);
    if (p.kind !== "sent") return [];
    // The same send number can exist on two branches (S2.2 has an "SMS 1"
    // for contacts with an email and one for contacts without). Find the one
    // on THIS contact's route by replaying the workflow from entry.
    const route = walkSchedule(input.graph, { facts: entryFacts }).rows;
    const row =
      route.find((r) => r.type === p.channel && r.n === p.n) ??
      linearizeSchedule(input.graph).find((r) => r.type === p.channel && r.n === p.n);
    if (!row) return [];
    startId = row.stepId;
  }

  // From the last send, later checks ("Not Sent (Continue)") must see the
  // tags the contact has now. From entry, they must not (see above).
  const walk = walkSchedule(input.graph, {
    startId,
    skipStart: Boolean(startId),
    facts: startId ? facts : entryFacts,
    maxMessages: MAX_MESSAGES,
    maxMinutes: MAX_MINUTES,
    counterSeed: sentPosition(input.tags, input.codes),
  });

  const anchorMs = Date.parse(input.anchor.ts);
  const nowMs = input.now.getTime();
  const out: JourneyEvent[] = [];
  for (const r of walk.rows) {
    const at = anchorMs + r.offsetMinutes * 60_000;
    // A projection already in the past means the contact is held somewhere
    // we cannot see (an event wait, a paused step) — do not invent a date.
    if (at < nowMs) continue;
    const label = `${r.type === "email" ? "Email" : "SMS"} ${r.n} of ${input.code}`;
    const text = r.type === "email" ? (r.subject ?? "") : r.aiWritten ? "" : previewText(r.body, 60);
    out.push({
      id: `proj:${input.code}:${r.stepId}`,
      ts: new Date(at).toISOString(),
      lane: "message",
      kind: r.type === "email" ? "email_out_projected" : "sms_out_projected",
      title: `${label}${text ? ` — "${text}"` : r.aiWritten ? " (written at send time)" : ""}`,
      actor: input.code,
      projected: true,
      refs: { workflowCode: input.code, templateId: r.templateId ?? undefined },
      detail: {
        subject: r.subject,
        body: previewText(r.body, 2000),
        from: r.from,
        offsetMinutes: r.offsetMinutes,
        anchorTs: input.anchor.ts,
        anchorTag: input.anchor.tag,
        dependsOn: walk.dependsOn.length ? walk.dependsOn : undefined,
        branch: r.branchPath.join(" › ") || undefined,
      },
    });
  }
  return out;
}
