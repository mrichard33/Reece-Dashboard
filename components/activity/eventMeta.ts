import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Translates raw `system_events.event_type` strings into plain-language labels
 * for front-end users. `isSystem` marks infrastructure events (heartbeat, sync)
 * so the feed can de-emphasize them behind contact activity.
 *
 * Vocabulary mirrors the event_type strings emitted across LP-MCP
 * (lead.*, appointment_*, disposition_*, ghl.*, intent.*, heartbeat.tick …).
 */
export type EventMeta = {
  label: string;
  tone: BadgeTone;
  isSystem: boolean;
};

const MAP: Record<string, Omit<EventMeta, "isSystem"> & { isSystem?: boolean }> = {
  // Leads / status (LP)
  "lp.disposition_changed": { label: "Status changed", tone: "amber" },
  "lead.disposition_changed": { label: "Status changed", tone: "amber" },
  disposition_changed: { label: "Status changed", tone: "amber" },
  "lead.created": { label: "New lead", tone: "sky" },
  lead_created: { label: "New lead", tone: "sky" },
  "lead.updated": { label: "Lead updated", tone: "slate" },
  "lp.milestone_completed": { label: "Milestone completed", tone: "emerald" },
  "bucket.classified": { label: "Lead classified", tone: "sky" },

  // Contacts / opportunities
  "contact.created": { label: "Contact created", tone: "sky" },
  "ghl.contact_created": { label: "Contact created", tone: "sky" },
  "opportunity.created": { label: "New opportunity", tone: "sky" },

  // Appointments
  "ghl.appointment_booked": { label: "Appointment booked", tone: "emerald" },
  appointment_booked: { label: "Appointment booked", tone: "emerald" },
  appointment_set: { label: "Appointment booked", tone: "emerald" },
  "ghl.appointment_confirmed": { label: "Appointment confirmed", tone: "emerald" },
  "ghl.appointment_cancelled": { label: "Appointment cancelled", tone: "amber" },
  appointment_completed: { label: "Appointment completed", tone: "emerald" },
  appointment_no_show: { label: "Appointment no-show", tone: "rose" },

  // Demos / sales
  demo_completed: { label: "Demo completed", tone: "emerald" },
  demo_sale: { label: "Sale closed", tone: "emerald" },

  // Messages / engagement
  "ghl.reply_received": { label: "Customer replied", tone: "emerald" },
  "ghl.email_opened": { label: "Email opened", tone: "sky" },
  "ghl.link_clicked": { label: "Link clicked", tone: "sky" },
  "call.logged": { label: "Call logged", tone: "sky" },

  // Funnel / workflow lifecycle
  "ghl.workflow_handoff": { label: "Workflow handoff", tone: "sky" },
  "ghl.workflow_started": { label: "Workflow started", tone: "slate" },
  "ghl.workflow_completed": { label: "Workflow completed", tone: "slate" },
  "agentic.handoff_started": { label: "Handoff started", tone: "sky" },
  "ghl.e0_branch_fired": { label: "Entry branch fired", tone: "slate" },
  "ghl.tag_added": { label: "Tag added", tone: "slate" },
  "ghl.tag_removed": { label: "Tag removed", tone: "slate" },

  // Intent signals
  "intent.spike_detected": { label: "Buying-intent spike", tone: "emerald" },
  "intent.stall_detected": { label: "Lead going cold", tone: "amber" },
  "intent.objection_detected": { label: "Objection raised", tone: "amber" },
  "intent.tier_changed": { label: "Intent tier changed", tone: "sky" },
  "ghl.lead_score_changed": { label: "Lead score changed", tone: "sky" },
  objection_state_transition: { label: "Objection state changed", tone: "amber" },

  // Health / ops issues (contact-linked, surfaced — not system)
  "system.drift_detected": { label: "Sync drift detected", tone: "rose" },
  drift_detected: { label: "Sync drift detected", tone: "rose" },
  confirmation_unacknowledged: { label: "Confirmation unacknowledged", tone: "amber" },
  state_transition_rejected: { label: "Status change rejected", tone: "amber" },
  "ai.analysis_completed": { label: "AI analysis completed", tone: "slate" },
  "ai.analysis_failed": { label: "AI analysis failed", tone: "rose" },
  "email.enrichment_available": { label: "Email enrichment available", tone: "slate" },
  message_analyzer_proposal: { label: "Message proposal", tone: "slate" },

  // System / infrastructure (de-emphasized)
  "heartbeat.tick": { label: "System heartbeat", tone: "slate", isSystem: true },
};

/** Title-case a raw event_type as a fallback ("ghl.lead_score_changed" → "Ghl Lead Score Changed"). */
function humanize(eventType: string): string {
  return eventType
    .split(/[._:]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function eventMeta(eventType: string): EventMeta {
  const hit = MAP[eventType];
  if (hit) return { isSystem: false, ...hit };
  // Unknown sync./heartbeat./system.-prefixed events are treated as system.
  const isSystem = /^(sync|heartbeat|system|cron|scheduler)[._:]/.test(eventType);
  return { label: humanize(eventType), tone: "slate", isSystem };
}
