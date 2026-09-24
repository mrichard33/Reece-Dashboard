/**
 * getJourney(ghlContactId) — the read-time merge behind the Journey Card.
 *
 * HL rows (contacts, opportunities, appointments, messages, lead_events) and
 * the LP MCP timeline are fetched IN PARALLEL and merged in JS by timestamp.
 * The two Supabases are never joined. Every HL read is a single-contact scan
 * on an indexed column (`db/migrations/0021_journey_indexes.sql` makes the
 * lead_events and messages ones cheap; the code works, slower, without them).
 *
 * Degrade, don't fail: LP down → HL-only journey with `sources.lp = "error"`
 * and an amber banner. HL down → throw; the route answers 500.
 */
import { unstable_cache } from "next/cache";
import { hlService } from "@/lib/supabase/hl";
import { lpService } from "@/lib/supabase/lp";
import { lpMcp, lpUrlConfigured } from "@/lib/mcp/lpClient";
import { etDateTime } from "@/lib/utils";
import type { Journey, JourneyEvent } from "./types";
import { loadWorkflowGraph } from "./workflowGraph.server";
import { projectionAnchor, projectNext } from "./projection";
import {
  activeWorkflowCodes,
  botState,
  entryLane,
  lpRoute,
  type RegistryEntry,
  resolveWorkflowCode,
  sentPosition,
  codesFor,
  stageTag,
  suppressionFor,
} from "./tags";
import {
  appointmentEvents,
  appointmentLabel,
  attributeBotSends,
  type HlAppointmentRow,
  type HlMessageRow,
  type HlOpportunityRow,
  type LeadEventRow,
  lpEvents,
  mergeSentTags,
  messageEvents,
  opportunityEvents,
  pipelineShort,
  type PipelineRow,
  sortEvents,
  stageName,
  tagDiffEvents,
  toIso,
} from "./normalize";

/** LP custom field ids on the GHL contact (confirmed on a live row 2026-09-24). */
export const CF_LP_PROSPECT_ID = "ZRQAVrzhtzApzLlHmT87";
export const CF_LP_LEAD_ID = "GmAVmW6V9sekD7pVONKr";

/** `custom_fields` is an array of `{ id, value }` — value may be a number. */
export function customField(fields: unknown, id: string): string | null {
  if (!Array.isArray(fields)) return null;
  for (const f of fields) {
    if (f && typeof f === "object" && (f as { id?: unknown }).id === id) {
      const v = (f as { value?: unknown }).value;
      if (v === null || v === undefined || v === "") return null;
      return String(v);
    }
  }
  return null;
}

export type HlContactRow = {
  ghl_contact_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  tags: string[] | null;
  custom_fields: unknown;
  date_added: string | null;
  date_updated: string | null;
};

export const CONTACT_COLUMNS =
  "ghl_contact_id, first_name, last_name, phone, email, city, state, source, tags, custom_fields, date_added, date_updated";

/**
 * lead_events projected down to what the journey reads. `raw_json` itself is
 * never selected: an email `sms_sent` row carries a whole HTML document, and
 * the tag snapshot is the only part of a `contact_updated` row we need.
 */
const LEAD_EVENT_COLUMNS = [
  "event_type",
  "event_time",
  "tags:raw_json->tags",
  "obj_id:raw_json->>id",
  "date_added:raw_json->>dateAdded",
  "date_updated:raw_json->>dateUpdated",
  "ts:raw_json->>timestamp",
  "appt_status:raw_json->>appointmentStatus",
  "start_time:raw_json->>startTime",
  "title:raw_json->>title",
  "pipeline_id:raw_json->>pipelineId",
  "stage_id:raw_json->>pipelineStageId",
  "status:raw_json->>status",
  "source:raw_json->>source",
  "appt:raw_json->appointment",
].join(", ");

/** Cap on lead_events per contact. The busiest real contact has ~5.4K. */
const LEAD_EVENT_CAP = 2000;
const MESSAGE_CAP = 500;

/** Registry + pipelines change rarely; share one copy for 10 minutes. */
export const loadRegistry = unstable_cache(
  async (): Promise<RegistryEntry[]> => {
    const { data, error } = await hlService()
      .from("workflow_registry")
      .select("canonical_code, canonical_name, legacy_name, workflow_id");
    if (error) throw new Error(`workflow_registry: ${error.message}`);
    return (data ?? []) as RegistryEntry[];
  },
  ["journey", "workflow_registry"],
  { revalidate: 600, tags: ["journey-static"] },
);

export const loadPipelines = unstable_cache(
  async (): Promise<PipelineRow[]> => {
    const { data, error } = await hlService()
      .from("pipelines")
      .select("ghl_pipeline_id, name, stages")
      .is("deleted_at", null);
    if (error) throw new Error(`pipelines: ${error.message}`);
    return (data ?? []) as PipelineRow[];
  },
  ["journey", "pipelines"],
  { revalidate: 600, tags: ["journey-static"] },
);

type LpLeadHeader = {
  lp_lead_id: string;
  lp_prospect_id: string | null;
  disposition_code: string | null;
  disposition_label: string | null;
  rep_name: string | null;
};

async function loadLpLead(ghlContactId: string): Promise<LpLeadHeader | null> {
  try {
    const { data, error } = await lpService()
      .from("lp_leads")
      .select("lp_lead_id, lp_prospect_id, disposition_code, disposition_label, rep_name")
      .eq("ghl_contact_id", ghlContactId)
      .order("created_at_lp", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return null;
    return ((data ?? [])[0] as LpLeadHeader | undefined) ?? null;
  } catch {
    return null;
  }
}

function hlOrThrow<T>(label: string, res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(`HL ${label}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

const OPEN_APPT_EXCLUDE = new Set(["cancelled", "canceled", "noshow", "no_show", "invalid"]);

export async function buildJourney(ghlContactId: string, now: Date = new Date()): Promise<Journey | null> {
  const sb = hlService();

  // Deleted contacts are NOT filtered here: a direct link (a bookmark, an
  // agent_actions row, a test contact) should still show what happened, with
  // a notice. The Leads list is where deleted contacts stay hidden.
  const contactRes = await sb
    .from("contacts")
    .select(`${CONTACT_COLUMNS}, deleted_at`)
    .eq("ghl_contact_id", ghlContactId)
    .maybeSingle();
  if (contactRes.error) throw new Error(`HL contacts: ${contactRes.error.message}`);
  const contact = contactRes.data as (HlContactRow & { deleted_at: string | null }) | null;
  if (!contact) return null;

  const [oppRes, apptRes, msgRes, evRes, registry, pipelines, lpTimeline, lpLead] = await Promise.all([
    sb
      .from("opportunities")
      .select("ghl_opportunity_id, ghl_pipeline_id, ghl_stage_id, name, status, monetary_value, date_added, date_updated")
      .eq("ghl_contact_id", ghlContactId)
      .is("deleted_at", null),
    sb
      .from("appointments")
      .select("ghl_appointment_id, ghl_calendar_id, title, status, start_time, end_time, assigned_to, created_at")
      .eq("ghl_contact_id", ghlContactId)
      .is("deleted_at", null),
    sb
      .from("messages")
      .select("ghl_message_id, direction, type, body, status, sent_at")
      .eq("ghl_contact_id", ghlContactId)
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(MESSAGE_CAP),
    sb
      .from("lead_events")
      .select(LEAD_EVENT_COLUMNS)
      .eq("contact_id", ghlContactId)
      // sms_* duplicates `messages` (which has the body and the email rows
      // lead_events never gets), so it is not read here.
      .not("event_type", "like", "sms_%")
      .order("event_time", { ascending: false })
      .limit(LEAD_EVENT_CAP),
    loadRegistry(),
    loadPipelines(),
    lpUrlConfigured
      ? lpMcp.getContactTimeline({ ghl_contact_id: ghlContactId, since_days: 0, limit_per_source: 200 })
      : Promise.resolve(null),
    loadLpLead(ghlContactId),
  ]);

  const opps = hlOrThrow<HlOpportunityRow[]>("opportunities", oppRes);
  const appts = hlOrThrow<HlAppointmentRow[]>("appointments", apptRes);
  const msgs = hlOrThrow<HlMessageRow[]>("messages", msgRes);
  const leadEvents = hlOrThrow<LeadEventRow[]>("lead_events", evRes);

  const tags = contact.tags ?? [];
  const lpStatus: Journey["sources"]["lp"] = lpTimeline === null ? "unconfigured" : lpTimeline.ok ? "ok" : "error";

  // ── Events ───────────────────────────────────────────────────────────
  const snapshots = leadEvents
    .filter((e) => (e.event_type === "contact_updated" || e.event_type === "contact_created") && Array.isArray(e.tags))
    .map((e) => ({
      ts: toIso(e.event_time) ?? e.event_time,
      tags: e.tags as string[],
      created: e.event_type === "contact_created",
    }));

  const createdRow = leadEvents.find((e) => e.event_type === "contact_created");
  const createdAt = toIso(createdRow?.event_time) ?? toIso(contact.date_added);
  const created: JourneyEvent[] = createdAt
    ? [
        {
          id: `hl:contact_created:${contact.ghl_contact_id}`,
          ts: createdAt,
          lane: "system",
          kind: "contact_created",
          title: `Contact created in GHL${contact.source ? ` (source: ${contact.source})` : ""}`,
        },
      ]
    : [];

  const lpItems = lpTimeline?.ok ? lpTimeline.data.timeline : [];
  const nowIso = now.toISOString();

  let events: JourneyEvent[] = [
    ...created,
    ...tagDiffEvents(snapshots, registry),
    ...messageEvents(msgs),
    ...appointmentEvents(appts, leadEvents),
    ...opportunityEvents(opps, leadEvents, pipelines),
    ...lpEvents(lpItems),
  ];
  events = attributeBotSends(mergeSentTags(events));
  events = sortEvents(events).filter((e) => e.ts <= nowIso);

  // ── Header ───────────────────────────────────────────────────────────
  const activeCodes = activeWorkflowCodes(tags);
  const activeWorkflows = activeCodes.map((code) => {
    const reg = resolveWorkflowCode(code, registry);
    return {
      code: reg?.canonical_code ?? code,
      name: reg?.canonical_name ?? code,
      ghlWorkflowId: reg?.workflow_id ?? null,
      tagCode: code,
    };
  });
  // "Current" = the active workflow entered most recently (one per lane is
  // normal; the newest entry is what the contact is living through now).
  const lastEntered = new Map<string, string>();
  for (const e of events) if (e.kind === "workflow_entered" && e.actor) lastEntered.set(e.actor, e.ts);
  const current =
    [...activeWorkflows].sort((a, b) => (lastEntered.get(b.tagCode) ?? "").localeCompare(lastEntered.get(a.tagCode) ?? ""))[0] ??
    null;

  const pipeById = new Map(pipelines.map((p) => [p.ghl_pipeline_id, p]));
  const openOpps = opps.filter((o) => (o.status ?? "").toLowerCase() === "open");
  const byUpdated = (a: HlOpportunityRow, b: HlOpportunityRow) => (b.date_updated ?? "").localeCompare(a.date_updated ?? "");
  const opp = [...openOpps].sort(byUpdated)[0] ?? [...opps].sort(byUpdated)[0] ?? null;
  const oppPipe = opp ? pipeById.get(opp.ghl_pipeline_id ?? "") : undefined;

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || "Unknown contact";

  // ── Now ──────────────────────────────────────────────────────────────
  const upcoming = appts
    .filter((a) => a.start_time && a.start_time >= nowIso && !OPEN_APPT_EXCLUDE.has((a.status ?? "").toLowerCase()))
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))[0];
  const latestAppt = [...appts].sort((a, b) => (b.start_time ?? "").localeCompare(a.start_time ?? ""))[0];
  const apptForNow = upcoming ?? latestAppt;
  const openAppointment: JourneyEvent | null = apptForNow
    ? {
        id: `appt:${apptForNow.ghl_appointment_id}:now`,
        ts: toIso(apptForNow.start_time) ?? nowIso,
        lane: "appointment",
        kind: upcoming ? "appointment_upcoming" : `appointment_${(apptForNow.status ?? "unknown").toLowerCase()}`,
        title: `${appointmentLabel(apptForNow.title)} — ${(apptForNow.status ?? "unknown").toUpperCase()} (${apptForNow.start_time ? etDateTime(apptForNow.start_time) : "time unknown"})`,
        refs: { appointmentId: apptForNow.ghl_appointment_id },
        detail: { status: apptForNow.status, start: apptForNow.start_time },
      }
    : null;

  const last = (pred: (e: JourneyEvent) => boolean) => [...events].reverse().find(pred) ?? null;

  let workflowPosition: string | null = null;
  if (current) {
    const reg = resolveWorkflowCode(current.tagCode, registry);
    const pos = sentPosition(tags, reg ? codesFor(reg) : [current.tagCode]);
    const parts = [pos.email ? `Email ${pos.email}` : "", pos.sms ? `SMS ${pos.sms}` : ""].filter(Boolean);
    workflowPosition = parts.length ? `${parts.join(" · ")} sent` : "Entered — no sends yet";
  }

  // ── Next (projected) ─────────────────────────────────────────────────
  // One projection per active workflow (one per lane is normal), merged. A
  // graph that fails to load costs that workflow's projection, never the page.
  let next: JourneyEvent[] = [];
  if (!suppressionFor(tags)) {
    const perWorkflow = await Promise.all(
      activeWorkflows
        .filter((w) => w.ghlWorkflowId)
        .map(async (w) => {
          try {
            const reg = resolveWorkflowCode(w.tagCode, registry);
            const codes = reg ? codesFor(reg) : [w.tagCode];
            const graph = await loadWorkflowGraph(w.ghlWorkflowId as string);
            return projectNext({
              tags,
              hasEmail: Boolean(contact.email),
              hasPhone: Boolean(contact.phone),
              code: w.code,
              codes,
              graph,
              anchor: projectionAnchor(tags, snapshots, codes),
              now,
            });
          } catch (e) {
            console.error("[journey] projection", w.code, e);
            return [];
          }
        }),
    );
    next = perWorkflow.flat().sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, 5);
  }

  // ── Stats ────────────────────────────────────────────────────────────
  const workflowsSeen = new Set<string>();
  for (const e of events) if (e.kind === "workflow_entered" && e.refs?.workflowCode) workflowsSeen.add(e.refs.workflowCode);
  for (const w of activeWorkflows) workflowsSeen.add(w.code);

  return {
    header: {
      ghlContactId: contact.ghl_contact_id,
      name,
      phone: contact.phone,
      email: contact.email,
      city: [contact.city, contact.state].filter(Boolean).join(", ") || null,
      source: contact.source,
      entryLane: entryLane(tags),
      pipeline: pipelineShort(oppPipe),
      stage: opp ? stageName(oppPipe, opp.ghl_stage_id) : null,
      currentWorkflow: current ? { code: current.code, name: current.name, ghlWorkflowId: current.ghlWorkflowId } : null,
      activeWorkflows: activeWorkflows.map(({ code, name: n, ghlWorkflowId }) => ({ code, name: n, ghlWorkflowId })),
      stageTag: stageTag(tags),
      lp: {
        prospectId: customField(contact.custom_fields, CF_LP_PROSPECT_ID) ?? lpLead?.lp_prospect_id ?? null,
        leadId:
          customField(contact.custom_fields, CF_LP_LEAD_ID) ??
          lpLead?.lp_lead_id ??
          (lpTimeline?.ok ? (lpTimeline.data.resolved.lp_lead_ids[0] ?? null) : null),
        disposition: lpLead?.disposition_label ?? lpLead?.disposition_code ?? null,
        route: lpRoute(tags),
        rep: lpLead?.rep_name ?? null,
      },
      bot: botState(tags),
      tags,
      enteredAt: toIso(contact.date_added),
      deletedAt: toIso(contact.deleted_at),
    },
    now: {
      workflowPosition,
      openAppointment,
      lastCall: last((e) => e.lane === "call"),
      lastMessage: last((e) => e.lane === "message" && e.id.startsWith("msg:")),
      suppression: suppressionFor(tags),
    },
    next,
    stats: {
      messagesOut: events.filter((e) => e.lane === "message" && e.kind.endsWith("_out")).length,
      messagesIn: events.filter((e) => e.lane === "message" && e.kind.endsWith("_in")).length,
      calls: events.filter((e) => e.lane === "call").length,
      appts: new Set(appts.map((a) => a.ghl_appointment_id)).size,
      workflows: [...workflowsSeen].sort(),
      notes: events.filter((e) => e.lane === "note").length,
    },
    events,
    sources: { hl: "ok", lp: lpStatus },
    builtAt: nowIso,
  };
}

/**
 * Cached 60s per contact (spec §B8). `fresh` bypasses the cache — the
 * journey's Refresh button uses it so an operator never waits out a stale copy.
 */
export function getJourney(ghlContactId: string, opts: { fresh?: boolean } = {}): Promise<Journey | null> {
  if (opts.fresh) return buildJourney(ghlContactId);
  return unstable_cache(() => buildJourney(ghlContactId), ["journey", ghlContactId], {
    revalidate: 60,
    tags: ["journey", `journey:${ghlContactId}`],
  })();
}
