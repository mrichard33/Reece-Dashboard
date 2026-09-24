/**
 * Source rows → JourneyEvent. Pure: no Supabase, no MCP, no clock except the
 * `now` a caller passes in. `build.ts` does the I/O and hands the rows here.
 *
 * Mapping table: design spec v1 §C "lib/journey/build.ts". The rules that keep
 * the timeline readable live here too — dedupe a `sent:*` tag against the
 * message it announced, collapse bursts of tag churn, hide skipped rules.
 */
import type { JourneyEvent, JourneyLane } from "./types";
import { diffTagSnapshots, humanizeTagValue, parseTag, type RegistryEntry, resolveWorkflowCode } from "./tags";
import { etDateTime } from "@/lib/utils";

// ── Row shapes (projected columns only — never select('*')) ───────────────

export type HlMessageRow = {
  ghl_message_id: string;
  direction: string | null;
  type: string | null;
  body: string | null;
  status: string | null;
  sent_at: string | null;
};

export type HlAppointmentRow = {
  ghl_appointment_id: string;
  ghl_calendar_id: string | null;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  assigned_to: string | null;
  created_at: string | null;
};

export type HlOpportunityRow = {
  ghl_opportunity_id: string;
  ghl_pipeline_id: string | null;
  ghl_stage_id: string | null;
  name: string | null;
  status: string | null;
  monetary_value: number | null;
  date_added: string | null;
  date_updated: string | null;
};

/**
 * One `lead_events` row, projected. Appointment webhooks arrive in two shapes —
 * flat (`startTime`, `appointmentStatus` on the root) and nested under
 * `appointment` — so both are carried and read with `apptField`.
 */
export type LeadEventRow = {
  event_type: string;
  event_time: string;
  tags: string[] | null;
  obj_id: string | null;
  date_added: string | null;
  date_updated: string | null;
  ts: string | null;
  appt_status: string | null;
  start_time: string | null;
  title: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  status: string | null;
  source: string | null;
  appt: Record<string, unknown> | null;
};

export type PipelineRow = {
  ghl_pipeline_id: string;
  name: string | null;
  stages: { id: string; name: string }[] | null;
};

export type LpTimelineItem = {
  ts: string;
  source: string;
  type: string;
  summary: string;
  detail?: Record<string, unknown>;
};

// ── Small helpers ─────────────────────────────────────────────────────────

export function toIso(x: string | null | undefined): string | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Strip HTML, collapse whitespace, cut to n chars with an ellipsis. */
export function preview(text: string | null | undefined, n = 90): string {
  if (!text) return "";
  const plain = text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > n ? `${plain.slice(0, n - 1).trimEnd()}…` : plain;
}

/** Plain-text body for the expanded row (emails are HTML). */
export function plainBody(text: string | null | undefined): string {
  return preview(text, 20_000);
}

/** "Joy Moberly - Window Estimate" → "Window Estimate". */
export function appointmentLabel(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "Appointment";
  const i = t.lastIndexOf(" - ");
  return i >= 0 ? t.slice(i + 3).trim() || t : t;
}

export type Channel = "sms" | "email" | "chat" | "fb" | "ig" | "call" | "other";

/** GHL message `type` codes seen in the cache (verified 2026-09-24). */
export function messageChannel(type: string | null | undefined): Channel {
  switch (String(type ?? "")) {
    case "1":
      return "call";
    case "2":
      return "sms";
    case "3":
      return "email";
    case "29":
      return "chat";
    case "11":
      return "fb";
    case "18":
      return "ig";
    default:
      return "other";
  }
}

const CHANNEL_LABEL: Record<Channel, string> = {
  sms: "SMS",
  email: "Email",
  chat: "Chat",
  fb: "Facebook",
  ig: "Instagram",
  call: "Call",
  other: "Message",
};

export function channelLabel(c: Channel): string {
  return CHANNEL_LABEL[c];
}

/** P1/P2/P3 from the pipeline name's leading number ("1. Antifragile …"). */
export function pipelineShort(p: PipelineRow | undefined): string | null {
  if (!p) return null;
  const m = /^(\d+)\./.exec(p.name ?? "");
  return m ? `P${m[1]}` : (p.name ?? null);
}

export function stageName(p: PipelineRow | undefined, stageId: string | null | undefined): string | null {
  if (!p || !stageId) return null;
  return p.stages?.find((s) => s.id === stageId)?.name ?? null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Drop raw payload copies from LP detail before it reaches the browser. */
function cleanDetail(d: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!d) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === "raw" || k === "raw_lp_data") continue;
    out[k] = v;
  }
  return out;
}

// ── HL: messages ──────────────────────────────────────────────────────────

export function messageEvents(rows: readonly HlMessageRow[]): JourneyEvent[] {
  const out: JourneyEvent[] = [];
  for (const m of rows) {
    const ts = toIso(m.sent_at);
    if (!ts) continue;
    const ch = messageChannel(m.type);
    const inbound = (m.direction ?? "").toLowerCase() === "inbound";
    const dir = inbound ? "in" : "out";
    const failed = ["failed", "undelivered"].includes((m.status ?? "").toLowerCase());
    const text = preview(m.body);
    const arrow = inbound ? "←" : "→";
    let title: string;
    if (ch === "call") {
      title = `${arrow} Call logged in GHL${m.status ? ` (${m.status})` : ""}`;
    } else {
      title = `${arrow} ${CHANNEL_LABEL[ch]}${text ? `: "${text}"` : ""}`;
    }
    if (failed) title += ` — ${m.status}`;
    out.push({
      id: `msg:${m.ghl_message_id}`,
      ts,
      lane: ch === "call" ? "call" : "message",
      kind: ch === "call" ? `ghl_call_${dir}` : `${ch}_${dir}`,
      title,
      // Type 29 outbound is the chat bot by construction; SMS/email authorship
      // is filled in later (workflow via sent:* tag, Bot via agent_actions).
      actor: ch === "chat" && !inbound ? "Bot" : undefined,
      detail: {
        body: plainBody(m.body),
        channel: CHANNEL_LABEL[ch],
        direction: inbound ? "inbound" : "outbound",
        status: m.status,
      },
    });
  }
  return out;
}

// ── HL: tag-snapshot diff ─────────────────────────────────────────────────

type Snapshot = { ts: string; tags: string[]; created: boolean };

/**
 * `contact_updated` (and `contact_created`) snapshots → workflow entries and
 * exits, sends, stage moves, lane changes, LP routes, bot state, and one
 * collapsed "Tags changed" row for the rest.
 *
 * The first snapshot is a BASELINE, not a burst of events, unless it is the
 * `contact_created` row (then its tags genuinely arrived at creation). History
 * can be truncated by the row cap, and announcing 20 tags as "added" on the
 * oldest surviving update would invent a moment that never happened.
 */
export function tagDiffEvents(
  snapshots: readonly Snapshot[],
  registry: readonly RegistryEntry[],
): JourneyEvent[] {
  const sorted = [...snapshots].sort((a, b) => a.ts.localeCompare(b.ts));
  const out: JourneyEvent[] = [];
  let prev: string[] | null = null;

  for (const snap of sorted) {
    if (prev === null && !snap.created) {
      prev = snap.tags;
      continue;
    }
    const { added, removed } = diffTagSnapshots(prev ?? [], snap.tags);
    prev = snap.tags;
    if (added.length === 0 && removed.length === 0) continue;

    const otherAdded: string[] = [];
    const otherRemoved: string[] = [];
    const push = (e: Omit<JourneyEvent, "ts">) => out.push({ ...e, ts: snap.ts });

    for (const tag of added) {
      const p = parseTag(tag);
      switch (p.kind) {
        case "active_workflow": {
          const reg = resolveWorkflowCode(p.code, registry);
          const name = reg?.canonical_name ?? p.code;
          push({
            id: `tag:${snap.ts}:+${tag}`,
            lane: "workflow",
            kind: "workflow_entered",
            title: `Entered ${name.startsWith(p.code) ? name : `${p.code} ${name}`}`,
            actor: p.code,
            refs: { workflowCode: reg?.canonical_code ?? p.code },
            detail: { tag, ghlWorkflowId: reg?.workflow_id ?? null },
          });
          break;
        }
        case "sent":
          push({
            id: `tag:${snap.ts}:+${tag}`,
            lane: "message",
            kind: p.channel === "email" ? "email_out" : "sms_out",
            title: `${p.channel === "email" ? "Email" : "SMS"} ${p.n} of ${p.code} sent`,
            actor: p.code,
            refs: { workflowCode: p.code },
            detail: { tag, channel: p.channel === "email" ? "Email" : "SMS", direction: "outbound", n: p.n },
          });
          break;
        case "stage":
          push({
            id: `tag:${snap.ts}:+${tag}`,
            lane: "stage",
            kind: "stage_changed",
            title: `Stage → ${humanizeTagValue(p.value)}`,
            detail: { tag, removed: removed.filter((t) => parseTag(t).kind === "stage") },
          });
          break;
        case "entry":
          if (p.active) {
            push({
              id: `tag:${snap.ts}:+${tag}`,
              lane: "workflow",
              kind: "entry_set",
              title: `Lane → ${humanizeTagValue(p.value)}`,
              detail: { tag },
            });
          } else otherAdded.push(tag);
          break;
        case "lp_route":
        case "lp_status":
          push({
            id: `tag:${snap.ts}:+${tag}`,
            lane: "lp",
            kind: "lp_route",
            title: `LP: ${humanizeTagValue(p.kind === "lp_status" ? `lead ${p.value}` : p.value)}`,
            detail: { tag },
          });
          break;
        case "bot":
          push({
            id: `tag:${snap.ts}:+${tag}`,
            lane: "bot",
            kind: "bot_state",
            title:
              p.value === "agentic-active"
                ? "Bot switched on (agentic-active)"
                : p.value === "stop-bot"
                  ? "Bot stopped (stop-bot)"
                  : `Consent: ${tag} added`,
            detail: { tag },
          });
          break;
        default:
          otherAdded.push(tag);
      }
    }

    for (const tag of removed) {
      const p = parseTag(tag);
      if (p.kind === "active_workflow") {
        push({
          id: `tag:${snap.ts}:-${tag}`,
          lane: "workflow",
          kind: "workflow_exited",
          title: `Left ${p.code}`,
          actor: p.code,
          refs: { workflowCode: resolveWorkflowCode(p.code, registry)?.canonical_code ?? p.code },
          detail: { tag },
        });
      } else if (p.kind === "bot" && (p.value === "stop-bot" || p.value === "agentic-active")) {
        push({
          id: `tag:${snap.ts}:-${tag}`,
          lane: "bot",
          kind: "bot_state",
          title: p.value === "stop-bot" ? "Bot resumed (stop-bot removed)" : "Bot switched off (agentic-active removed)",
          detail: { tag },
        });
      } else if (p.kind === "stage" || p.kind === "sent") {
        // A stage swap is already told by the added stage; a removed sent:*
        // tag is workflow housekeeping on re-entry. Neither is news.
        continue;
      } else {
        otherRemoved.push(tag);
      }
    }

    if (otherAdded.length || otherRemoved.length) {
      push({
        id: `tag:${snap.ts}:other`,
        lane: "tag",
        kind: "tags_changed",
        title: tagsChangedTitle(otherAdded.length, otherRemoved.length),
        detail: { added: otherAdded, removed: otherRemoved },
        collapsedCount: 1,
      });
    }
  }
  return collapseTagChurn(out);
}

function tagsChangedTitle(a: number, r: number): string {
  const parts = [a ? `+${a}` : "", r ? `−${r}` : ""].filter(Boolean).join(" ");
  return `Tags changed (${parts})`;
}

/**
 * "Tags changed" rows within 60s of the previous one fold into it, even with
 * a named event (workflow entered, stage) between them — a workflow step that
 * adds six tags in three webhook bursts is one moment to a reader.
 */
export function collapseTagChurn(events: readonly JourneyEvent[]): JourneyEvent[] {
  const out: JourneyEvent[] = [];
  let open: JourneyEvent | null = null;
  for (const e of events) {
    if (e.kind !== "tags_changed") {
      out.push(e);
      continue;
    }
    if (open && Date.parse(e.ts) - Date.parse(open.ts) <= 60_000) {
      const added = [...((open.detail?.added as string[]) ?? []), ...((e.detail?.added as string[]) ?? [])];
      const removed = [...((open.detail?.removed as string[]) ?? []), ...((e.detail?.removed as string[]) ?? [])];
      open.detail = { added, removed };
      open.collapsedCount = (open.collapsedCount ?? 1) + 1;
      open.title = tagsChangedTitle(added.length, removed.length);
      continue;
    }
    open = { ...e, detail: e.detail ? { ...e.detail } : undefined };
    out.push(open);
  }
  return out;
}

// ── HL: appointments ──────────────────────────────────────────────────────

function apptField(e: LeadEventRow, key: string): string | null {
  const nested = e.appt ? str(e.appt[key]) : null;
  return nested ?? null;
}

/**
 * Appointment lifecycle. `lead_events.event_time` for appointment webhooks is
 * the appointment's START, not when the change happened (Moberly's cancel row
 * reads 5:00 PM — the slot — while the cancel landed at 11:43 AM). The real
 * moment is `dateAdded` for a booking and `dateUpdated` for everything after.
 */
export function appointmentEvents(
  appts: readonly HlAppointmentRow[],
  events: readonly LeadEventRow[],
): JourneyEvent[] {
  const out: JourneyEvent[] = [];
  const seen = new Map<string, { start: string | null; kinds: Set<string> }>();

  const rows = events
    .filter((e) => e.event_type.startsWith("appointment_"))
    .map((e) => {
      const id = apptField(e, "id") ?? e.obj_id ?? "";
      const status = (apptField(e, "appointmentStatus") ?? e.appt_status ?? "").toLowerCase();
      const start = toIso(apptField(e, "startTime") ?? e.start_time);
      const title = apptField(e, "title") ?? e.title;
      const added = toIso(apptField(e, "dateAdded") ?? e.date_added);
      const updated = toIso(apptField(e, "dateUpdated") ?? e.date_updated);
      const type = e.event_type.replace(/^appointment_/, "");
      const at = type === "booked" && status !== "confirmed" ? (added ?? updated) : (updated ?? added);
      return { id, status, start, title, type, at: at ?? toIso(e.event_time) ?? e.event_time };
    })
    .filter((r) => r.id)
    .sort((a, b) => a.at.localeCompare(b.at));

  for (const r of rows) {
    const s = seen.get(r.id) ?? { start: null, kinds: new Set<string>() };
    const label = appointmentLabel(r.title);
    const when = r.start ? etDateTime(r.start) : "time unknown";
    let kind: string;
    let title: string;
    if (r.type === "cancelled" || r.status === "cancelled") {
      kind = "appointment_cancelled";
      title = `${label} CANCELLED (was ${when})`;
    } else if (r.type === "noshow" || r.status === "noshow") {
      kind = "appointment_noshow";
      title = `${label} — no-show (was ${when})`;
    } else if (r.type === "showed" || r.status === "showed") {
      kind = "appointment_showed";
      title = `${label} — showed (${when})`;
    } else if (s.kinds.size > 0 && s.start && r.start && s.start !== r.start) {
      kind = "appointment_rescheduled";
      title = `${label} rescheduled → ${when} (was ${etDateTime(s.start)})`;
    } else if (r.status === "confirmed") {
      kind = "appointment_confirmed";
      title = `${label} confirmed — ${when}`;
    } else {
      kind = "appointment_booked";
      title = `${label} booked — ${when}`;
    }
    const dedupeKey = kind === "appointment_rescheduled" ? `${kind}:${r.start}` : kind;
    if (!s.kinds.has(dedupeKey)) {
      out.push({
        id: `appt:${r.id}:${dedupeKey}`,
        ts: r.at,
        lane: "appointment",
        kind,
        title,
        refs: { appointmentId: r.id },
        detail: { start: r.start, status: r.status || null },
      });
      s.kinds.add(dedupeKey);
    }
    if (r.start) s.start = r.start;
    seen.set(r.id, s);
  }

  // Appointments the webhook log never saw (older than it, or missed): one
  // "booked" row at the cache's first sight of it, marked approximate.
  for (const a of appts) {
    if (seen.has(a.ghl_appointment_id)) continue;
    const ts = toIso(a.created_at) ?? toIso(a.start_time);
    if (!ts) continue;
    const label = appointmentLabel(a.title);
    out.push({
      id: `appt:${a.ghl_appointment_id}:cache`,
      ts,
      lane: "appointment",
      kind: "appointment_booked",
      title: `${label} on the calendar — ${a.start_time ? etDateTime(a.start_time) : "time unknown"} (${a.status ?? "status unknown"})`,
      refs: { appointmentId: a.ghl_appointment_id },
      detail: { start: toIso(a.start_time), status: a.status, approximateTime: true },
    });
  }
  return out;
}

// ── HL: opportunities ─────────────────────────────────────────────────────

export function opportunityEvents(
  opps: readonly HlOpportunityRow[],
  events: readonly LeadEventRow[],
  pipelines: readonly PipelineRow[],
): JourneyEvent[] {
  const byId = new Map(pipelines.map((p) => [p.ghl_pipeline_id, p]));
  const out: JourneyEvent[] = [];
  const state = new Map<string, { stage: string | null; status: string | null }>();

  const rows = events
    .filter((e) => e.event_type.startsWith("opportunity_") && e.obj_id)
    .map((e) => ({
      id: e.obj_id as string,
      at: toIso(e.ts) ?? toIso(e.event_time) ?? e.event_time,
      pipelineId: e.pipeline_id,
      stageId: e.stage_id,
      status: (e.status ?? "").toLowerCase() || null,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

  const describe = (pipelineId: string | null, stageId: string | null) => {
    const p = byId.get(pipelineId ?? "");
    return { short: pipelineShort(p) ?? "Pipeline", stage: stageName(p, stageId) ?? "unknown stage" };
  };

  for (const r of rows) {
    const prev = state.get(r.id);
    const { short, stage } = describe(r.pipelineId, r.stageId);
    if (!prev) {
      out.push({
        id: `opp:${r.id}:created`,
        ts: r.at,
        lane: "pipeline",
        kind: "opp_created",
        title: `${short} opportunity opened — ${stage}`,
        refs: { opportunityId: r.id },
        detail: { pipeline: short, stage, status: r.status },
      });
    } else {
      if (r.stageId && r.stageId !== prev.stage) {
        out.push({
          id: `opp:${r.id}:stage:${r.at}`,
          ts: r.at,
          lane: "pipeline",
          kind: "stage_changed",
          title: `${short} → ${stage}`,
          refs: { opportunityId: r.id },
          detail: { pipeline: short, stage },
        });
      }
      if (r.status && r.status !== prev.status) {
        out.push({
          id: `opp:${r.id}:status:${r.at}`,
          ts: r.at,
          lane: "pipeline",
          kind: "status_changed",
          title: `${short} opportunity ${r.status}`,
          refs: { opportunityId: r.id },
          detail: { pipeline: short, status: r.status, previous: prev.status },
        });
      }
    }
    state.set(r.id, { stage: r.stageId ?? prev?.stage ?? null, status: r.status ?? prev?.status ?? null });
  }

  for (const o of opps) {
    if (state.has(o.ghl_opportunity_id)) continue;
    const ts = toIso(o.date_added);
    if (!ts) continue;
    const { short, stage } = describe(o.ghl_pipeline_id, o.ghl_stage_id);
    out.push({
      id: `opp:${o.ghl_opportunity_id}:created`,
      ts,
      lane: "pipeline",
      kind: "opp_created",
      title: `${short} opportunity opened — now ${stage} (${o.status ?? "status unknown"})`,
      refs: { opportunityId: o.ghl_opportunity_id },
      detail: { pipeline: short, stage, status: o.status, value: o.monetary_value },
    });
  }
  return out;
}

// ── LP timeline ───────────────────────────────────────────────────────────

const CALL_RESULTS: Record<string, string> = {
  LVM: "Left voicemail",
  NA: "No answer",
  BZ: "Busy",
  BUSY: "Busy",
  WN: "Wrong number",
  DNC: "Do not call",
  NI: "Not interested",
  HU: "Hung up",
  DC: "Disconnected",
};

function fmtSeconds(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

function pick(obj: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return null;
}

export function lpEvents(items: readonly LpTimelineItem[]): JourneyEvent[] {
  // LP writes a call twice: an lp_call_logs row and an lp_activities "call"
  // row at the same instant. The activity carries the readable result
  // ("Left VoiceMail"); fold it into the call and drop the duplicate.
  const callActivity = new Map<string, string>();
  for (const it of items) {
    if (it.type === "activity" && str(it.detail?.activity_type)?.toLowerCase() === "call") {
      const detail = str(it.detail?.activity_detail);
      if (detail) callActivity.set(toIso(it.ts) ?? it.ts, detail);
    }
  }

  const out: JourneyEvent[] = [];
  items.forEach((it, i) => {
    const ts = toIso(it.ts);
    if (!ts) return;
    const d = it.detail ?? {};
    const id = `lp:${it.type}:${str(d.id) ?? `${ts}:${i}`}`;

    if (it.type === "lead_created") {
      out.push({ id, ts, lane: "lp", kind: "lp_lead_created", title: it.summary, actor: pick(d, ["rep"]) ?? undefined, detail: cleanDetail(d) });
      return;
    }
    if (it.type === "call") {
      const raw = (d.raw ?? {}) as Record<string, unknown>;
      const code = pick(raw, ["call_result"]);
      const result = (code && CALL_RESULTS[code.toUpperCase()]) ?? callActivity.get(ts) ?? code ?? "no outcome";
      const dur = fmtSeconds(raw.call_duration_sec);
      out.push({
        id,
        ts,
        lane: "call",
        kind: "call",
        title: `Call${dur ? ` ${dur}` : ""} — ${result}`,
        actor: pick(d, ["rep"]) ?? pick(raw, ["agent_name", "rep_name"]) ?? undefined,
        detail: {
          result,
          code,
          notes: pick(raw, ["call_notes"]),
          recording: pick(raw, ["recording_url"]),
          lp_lead_id: pick(d, ["lp_lead_id"]),
        },
      });
      return;
    }
    if (it.type === "note") {
      out.push({ id, ts, lane: "note", kind: "note", title: it.summary, actor: pick(d, ["rep", "created_by_rep_name"]) ?? undefined, detail: { note: pick(d, ["full_note"]) ?? it.summary } });
      return;
    }
    if (it.type === "activity") {
      if (str(d.activity_type)?.toLowerCase() === "call") return; // folded into the call
      out.push({
        id,
        ts,
        lane: "lp",
        kind: "activity",
        title: [str(d.activity_type), str(d.activity_detail)].filter(Boolean).join(" — ") || it.summary,
        actor: pick(d, ["rep_name"]) ?? undefined,
        detail: cleanDetail(d),
      });
      return;
    }
    if (it.type === "appointment_set") {
      // lp_leads.appointment_date is an untrusted cache (principles file):
      // appointment truth is GHL `appointments` + LP disposition history. Keep
      // the row for the LP lane, quiet, and never let it sit in the future.
      out.push({ id, ts, lane: "lp", kind: "lp_appointment", title: "LP shows an appointment on file", actor: pick(d, ["rep"]) ?? undefined, detail: cleanDetail(d), quiet: true });
      return;
    }

    if (it.type.startsWith("event:")) {
      const payload = (d.payload ?? {}) as Record<string, unknown>;
      const evType = it.type.slice("event:".length);
      if (evType === "five9.disposition_set") {
        const dur = fmtSeconds(payload.duration_sec ?? payload.call_duration ?? payload.duration);
        const dispo = pick(payload, ["disposition_name", "dispositionName", "disposition"]) ?? "No disposition";
        out.push({
          id,
          ts,
          lane: "call",
          kind: "five9_call",
          title: `Five9 call${dur ? ` ${dur}` : ""} — ${dispo}`,
          actor: pick(payload, ["agent_name", "agentName", "agent"]) ?? undefined,
          detail: { disposition: dispo, campaign: pick(payload, ["campaign"]) },
        });
        return;
      }
      if (evType === "lp.disposition_changed") {
        const to = pick(payload, ["disposition_code", "disposition"]);
        const from = pick(payload, ["previous_disposition"]);
        out.push({
          id,
          ts,
          lane: "lp",
          kind: "lp_disposition",
          title: from && to && from !== to ? `LP disposition ${from} → ${to}` : `LP disposition ${to ?? "changed"}`,
          detail: { from, to, reason: pick(payload, ["reason"]) },
        });
        return;
      }
      const branch = /^ghl\.(.+)_branch_fired$/.exec(evType);
      if (branch) {
        const wf = pick(payload, ["workflow"]) ?? branch[1]?.toUpperCase() ?? "Workflow";
        const b = pick(payload, ["branch"]);
        const dest = pick(payload, ["destination_workflow"]);
        out.push({
          id,
          ts,
          lane: "workflow",
          kind: "branch_fired",
          title: [`${wf} branch fired`, b, dest].filter(Boolean).join(" → "),
          actor: wf,
          refs: dest ? { workflowCode: dest } : undefined,
          detail: { branch: b, destination: dest },
        });
        return;
      }
      out.push({ id, ts, lane: "system", kind: "lp_event", title: it.summary, detail: { type: evType, payload }, quiet: true });
      return;
    }

    if (it.type.startsWith("action:")) {
      const rule = pick(d, ["rule"]);
      const reasoning = (pick(d, ["reasoning"]) ?? "").replace(/^Rule\s+\S+:\s*/, "");
      const status = /—\s*(\w+)/.exec(it.summary)?.[1]?.toLowerCase() ?? null;
      out.push({
        id,
        ts,
        lane: "bot",
        kind: "agent_action",
        title: `${rule ? `Rule ${rule}` : "Decision Engine"}: ${reasoning || it.type.slice("action:".length)}${status && status !== "completed" ? ` (${status})` : ""}`,
        actor: "Bot",
        refs: rule ? { ruleId: rule } : undefined,
        detail: { action: it.type.slice("action:".length), status, summary: it.summary, rule, reasoning },
        quiet: status === "skipped",
      });
      return;
    }

    out.push({ id, ts, lane: "system", kind: "lp_other", title: it.summary, detail: cleanDetail(d), quiet: true });
  });
  return out;
}

// ── Merge rules ───────────────────────────────────────────────────────────

const FIVE_MIN = 5 * 60_000;
const TWO_MIN = 2 * 60_000;

/**
 * A `sent:<code>-s1` tag and the SMS it announced are one event. Keep the
 * message (it has the body) and give it the workflow attribution. Matched by
 * channel within 5 minutes; each message absorbs at most one tag.
 */
export function mergeSentTags(events: readonly JourneyEvent[]): JourneyEvent[] {
  const tagSends = events.filter((e) => e.id.startsWith("tag:") && (e.kind === "sms_out" || e.kind === "email_out"));
  const msgs = events.filter((e) => e.id.startsWith("msg:") && (e.kind === "sms_out" || e.kind === "email_out"));
  const used = new Set<string>();
  const drop = new Set<string>();
  const patched = new Map<string, JourneyEvent>();

  for (const t of tagSends) {
    const tt = Date.parse(t.ts);
    let best: JourneyEvent | null = null;
    let bestGap = Infinity;
    for (const m of msgs) {
      if (used.has(m.id) || m.kind !== t.kind) continue;
      const gap = Math.abs(Date.parse(m.ts) - tt);
      if (gap <= FIVE_MIN && gap < bestGap) {
        best = m;
        bestGap = gap;
      }
    }
    if (!best) continue;
    used.add(best.id);
    drop.add(t.id);
    const n = t.detail?.n;
    const code = t.refs?.workflowCode ?? t.actor;
    const ch = t.kind === "email_out" ? "Email" : "SMS";
    const body = typeof best.detail?.body === "string" ? preview(best.detail.body) : "";
    patched.set(best.id, {
      ...best,
      actor: code,
      refs: { ...best.refs, workflowCode: code },
      title: `→ ${ch} ${n ?? ""} of ${code}${body ? ` — "${body}"` : ""}`.replace(/\s+of/, " of"),
      detail: { ...best.detail, sentTag: t.detail?.tag },
    });
  }

  return events.filter((e) => !drop.has(e.id)).map((e) => patched.get(e.id) ?? e);
}

/** Outbound SMS/email within 2 min of a Decision Engine send → "Bot". */
export function attributeBotSends(events: readonly JourneyEvent[]): JourneyEvent[] {
  const botSends = events
    .filter((e) => e.kind === "agent_action" && /send|reply|message|sms|email/i.test(String(e.detail?.action ?? "")))
    .map((e) => Date.parse(e.ts));
  if (botSends.length === 0) return [...events];
  return events.map((e) => {
    if (!e.id.startsWith("msg:") || e.actor || !/_out$/.test(e.kind)) return e;
    const t = Date.parse(e.ts);
    return botSends.some((b) => Math.abs(b - t) <= TWO_MIN) ? { ...e, actor: "Bot" } : e;
  });
}

export function sortEvents(events: readonly JourneyEvent[]): JourneyEvent[] {
  return [...events].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
}

/** Lanes a filter chip can toggle, in display order. */
export const LANE_CHIPS: { key: JourneyLane | "all"; label: string; lanes: JourneyLane[] }[] = [
  { key: "all", label: "All", lanes: [] },
  { key: "message", label: "Messages", lanes: ["message"] },
  { key: "call", label: "Calls", lanes: ["call"] },
  { key: "appointment", label: "Appts", lanes: ["appointment"] },
  { key: "workflow", label: "Workflows", lanes: ["workflow", "stage"] },
  { key: "pipeline", label: "Pipeline", lanes: ["pipeline"] },
  { key: "lp", label: "LP", lanes: ["lp", "note"] },
  { key: "bot", label: "Bot", lanes: ["bot"] },
  { key: "tag", label: "Tags", lanes: ["tag"] },
  { key: "system", label: "System", lanes: ["system"] },
];

/**
 * Which events a lane selection shows. Empty selection = "All": everything
 * except `quiet` rows. A quiet row shows only when its own lane chip is on.
 */
export function visibleEvents(events: readonly JourneyEvent[], selected: readonly string[]): JourneyEvent[] {
  if (selected.length === 0) return events.filter((e) => !e.quiet);
  const lanes = new Set<JourneyLane>();
  for (const key of selected) for (const l of LANE_CHIPS.find((c) => c.key === key)?.lanes ?? []) lanes.add(l);
  return events.filter((e) => lanes.has(e.lane));
}

/** "+14073739355" → "(407) 373-9355". Anything else passes through. */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : null;
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : phone;
}

/** GHL contact page. The location id is the one sub-account this system runs. */
export const GHL_LOCATION_ID = "SsBG7j5KQAIP1SFP2Sca";
export function ghlContactUrl(ghlContactId: string): string {
  return `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${ghlContactId}`;
}
