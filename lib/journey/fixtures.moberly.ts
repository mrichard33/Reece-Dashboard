/**
 * Real records for Joy Moberly (gkJmc5DPc3nHXoevNH5K), pulled live on
 * 2026-09-24 — the contact the design spec's verification steps name. Kept as
 * a fixture so the journey normalizers are tested against the shapes the
 * sources actually return, not shapes we imagine.
 */
import type { LpTimelineItem } from "./normalize";

/** lead_events contact_updated, 2026-09-23 20:19:21 ET (before the cancel). */
export const SNAPSHOT_BEFORE = [
  "entry:canvassing", "canvass-v2", "active-entry:canvassing", "ghl-attributed", "source:canvass",
  "canvass-subtype:door-to-door", "name-normalized", "lp-linked", "lp-enriched", "lp-route:stale-appt",
  "booked-estimate", "agentic-active", "appt:window-estimate", "indoctrination-paused", "appt-exists",
  "estimate-reminders-started", "window-estimate-booked", "estimate-booked", "salesrabbit-appt",
  "lp-route:appt-confirmed", "lp-lead-confirmed", "lp-lead-issued", "stage:new-lead",
];

/** lead_events contact_updated, 2026-09-24 11:44:30 ET (E.0 re-routing after the cancel). */
export const SNAPSHOT_AFTER = [
  "entry:canvassing", "canvass-v2", "active-entry:canvassing", "ghl-attributed", "source:canvass",
  "canvass-subtype:door-to-door", "name-normalized", "lp-linked", "lp-enriched", "lp-route:stale-appt",
  "agentic-active", "window-estimate-booked", "salesrabbit-appt", "lp-route:appt-confirmed",
  "lp-lead-confirmed", "lp-lead-issued", "agentic-inbound", "stage:appointment-rescue", "active-e.0",
  "canceled-estimate",
];

/** LP MCP get_contact_timeline (limit_per_source 3), trimmed of nothing but the `raw` bulk. */
export const LP_TIMELINE: LpTimelineItem[] = [
  { ts: "2026-09-24T17:00:00.000Z", source: "lp", type: "appointment_set", summary: "Appointment set (lead 577851)", detail: { rep: "Pettit, Jordan" } },
  {
    ts: "2026-09-24T15:50:19.768Z", source: "agentic", type: "event:lp.disposition_changed",
    summary: "lp.disposition_changed (CCC) — processed: no_matching_rules",
    detail: { id: 3903552, payload: { reason: "inbound_pre_dispositioned", disposition_code: "CCC", previous_disposition: "CCC" } },
  },
  {
    ts: "2026-09-24T15:44:37.391Z", source: "agentic", type: "event:ghl.e0_branch_fired",
    summary: "ghl.e0_branch_fired (canvassing) — processed: no_matching_rules",
    detail: { id: 3903381, payload: { branch: "canvassing", workflow: "E.0", destination_workflow: "E.4" } },
  },
  {
    ts: "2026-09-24T15:43:46.915Z", source: "agentic", type: "event:ghl.appointment_cancelled",
    summary: "ghl.appointment_cancelled (aJj14ONxh1oFyDcQ706O) — processed: no_matching_rules",
    detail: { id: 3903367, payload: { title: "Window Estimate", status: "cancelled" } },
  },
  {
    ts: "2026-09-23T17:00:37.949Z", source: "agentic", type: "action:sync_lp_appointment_to_ghl",
    summary: "sync_lp_appointment_to_ghl → ghl — skipped (already_in_sync)",
    detail: { id: 489558, rule: "LP_APPT_GHL_SYNC_CNF", reasoning: "Rule LP_APPT_GHL_SYNC_CNF: LP Cnf → GHL Window Estimate sync (confirm, create-confirmed if missing)" },
  },
  {
    ts: "2026-09-23T16:47:35.141Z", source: "agentic", type: "action:sync_lp_appointment_to_ghl",
    summary: "sync_lp_appointment_to_ghl → ghl — completed",
    detail: { id: 489527, rule: "LP_APPT_GHL_SYNC_CNF", reasoning: "Rule LP_APPT_GHL_SYNC_CNF: LP Cnf → GHL Window Estimate sync (confirm, create-confirmed if missing)" },
  },
  {
    ts: "2026-09-23T16:47:33.760Z", source: "agentic", type: "action:add_tag",
    summary: "add_tag → ghl — completed",
    detail: { id: 489526, rule: "LP_DISP_CNF", reasoning: "Rule LP_DISP_CNF: LP Cnf → Appointment Confirmed" },
  },
  {
    ts: "2026-09-23T09:20:42.000Z", source: "lp", type: "call", summary: "Call: no outcome",
    detail: { rep: "Mercado, Paula", lp_lead_id: "577851", raw: { call_result: "LVM", call_duration_sec: null, raw_lp_data: null } },
  },
  {
    ts: "2026-09-23T09:20:42.000Z", source: "lp", type: "activity", summary: "Activity: call",
    detail: { id: "b9304d21", activity_type: "call", activity_detail: "Left VoiceMail", rep_name: "Mercado, Paula" },
  },
  {
    ts: "2026-09-22T19:26:54.000Z", source: "lp", type: "call", summary: "Call: no outcome",
    detail: { rep: "Peterson, Kirk", lp_lead_id: "577851", raw: { call_result: "NA", call_duration_sec: null } },
  },
  {
    ts: "2026-09-22T19:26:54.000Z", source: "lp", type: "activity", summary: "Activity: call",
    detail: { id: "07fd611f", activity_type: "call", activity_detail: "No Answer", rep_name: "Peterson, Kirk" },
  },
  {
    ts: "2026-09-22T16:50:04.573Z", source: "lp", type: "note",
    summary: "Note: Spoke with Joy who wants a quote for 10 windows , pr and husband are both homeowners and will be pre…",
    detail: { full_note: "Spoke with Joy who wants a quote for 10 windows , pr and husband are both homeowners and will be present  set by Y.Francis", lp_lead_id: "577851" },
  },
  {
    ts: "2026-09-22T16:40:27.540Z", source: "lp", type: "lead_created",
    summary: "LP lead created (Canvass) — disposition: CCC", detail: { lp_lead_id: "577851", rep: "Pettit, Jordan" },
  },
];

/** lead_events appointment rows — flat shape; event_time is the SLOT, not the change. */
export const APPT_EVENTS = [
  {
    event_type: "appointment_booked", event_time: "2026-09-24T17:00:00-04:00", tags: null,
    obj_id: "uieK0Ur6et4S2jTQhlqY", date_added: "2026-09-22T20:50:52.000Z", date_updated: "2026-09-22T20:50:52.000Z",
    ts: null, appt_status: "new", start_time: "2026-09-24T17:00:00-04:00", title: "Joy Moberly - Window Estimate",
    pipeline_id: null, stage_id: null, status: null, source: null, appt: null,
  },
  {
    event_type: "appointment_cancelled", event_time: "2026-09-24T17:00:00-04:00", tags: null,
    obj_id: "uieK0Ur6et4S2jTQhlqY", date_added: "2026-09-22T20:50:52.000Z", date_updated: "2026-09-24T15:43:21.000Z",
    ts: null, appt_status: "cancelled", start_time: "2026-09-24T17:00:00-04:00", title: "Joy Moberly - Window Estimate",
    pipeline_id: null, stage_id: null, status: null, source: null, appt: null,
  },
];
