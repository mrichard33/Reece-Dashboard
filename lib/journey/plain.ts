/**
 * Plain-English layer for the lead timeline (2026-09-25).
 *
 * The team asked for a page anyone can read. Until now a row could say
 * `Rule LP_DISP_CNF: LP Cnf → Appointment Confirmed` or `LP status CCC`, which
 * only the person who wrote the rule understands. Every title now goes through
 * this module; the technical identifier (rule key, tag, event type) moves to a
 * "Technical" line inside the expanded row, so nothing is lost.
 *
 * Pure: no I/O, no React. Unknown inputs never throw — they fall back to a
 * readable generic sentence with the raw value kept.
 */
import { humanizeTagValue, parseTag, type RegistryEntry, resolveWorkflowCode } from "./tags";

// ── Lead Perfection dispositions ─────────────────────────────────────────
// Codes as LP stores them (lp_leads.disposition_code; disposition_label is
// NULL on every row, so the words live here). Best-effort readings of the
// short codes from the rule names that consume them; anything not listed
// reads as "LP status <code>".
const LP_DISPOSITIONS: Record<string, string> = {
  DATA: "New lead (details only)",
  SET: "Appointment set",
  CNF: "Appointment confirmed",
  "SOFT CONFIRM": "Appointment soft-confirmed",
  UNCON: "Appointment unconfirmed",
  RESET: "Appointment reset",
  CXL: "Appointment cancelled",
  CCC: "Cancelled — could not confirm",
  BO: "Appointment blown out",
  NS: "No-show",
  NOHOME: "Not home for the appointment",
  "NO HOME": "Not home for the appointment",
  ISSUE: "Appointment ran (demo issued)",
  "NO DEMO": "No demo given",
  OPPFDN: "Demo done, no sale yet",
  SALE: "Sold",
  DNC: "Do not contact",
  "1LEG": "Only one decision-maker was home",
  RENTER: "Renter, not the homeowner",
  NOREHASH: "No rehash",
  VERIF: "Verification",
};

export function dispositionWords(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "LP status changed";
  return LP_DISPOSITIONS[c.toUpperCase()] ?? `LP status ${c}`;
}

// ── Decision Engine rules ────────────────────────────────────────────────
// The top rules by fire count (LP agent_actions, 60 days to 2026-09-25) get a
// sentence. Everything else is read from the rule's own name with the
// jargon expanded (TOKEN_WORDS) — still readable, never a bare key.
const RULE_SENTENCES: Record<string, string> = {
  ENTRY_HYGIENE_AT_CREATION_CANVASSING: "New canvassing lead set up (entry tags checked)",
  ENTRY_HYGIENE_AT_CREATION_OTHER: "New lead set up (entry tags checked)",
  ENTRY_HYGIENE_AT_CREATION_FALLBACK: "New lead set up (entry tags checked)",
  LP_DISP_DATA: "New lead received from Lead Perfection",
  LP_DISP_SET: "Appointment set in Lead Perfection",
  LP_DISP_CNF: "Appointment confirmed in Lead Perfection",
  LP_DISP_SALE: "Sold — deal closed won",
  LP_DISP_OPPFDN: "Demo done, no sale yet — moved to post-appointment follow-up",
  LP_DISP_CANCEL_COLD_TO_S5_2: "Appointment cancelled in Lead Perfection — moved to Appointment Rescue (S5.2)",
  LP_DISP_NOSHOW_COLD_TO_TOFU: "No-show — moved back to the top of the funnel",
  LP_APPT_GHL_SYNC_SET: "Appointment copied from Lead Perfection to GHL",
  LP_APPT_GHL_SYNC_CNF: "Confirmed appointment copied from Lead Perfection to GHL",
  LP_APPT_GHL_SYNC_CXL: "Cancellation copied from Lead Perfection to GHL",
  GHL_APPT_LP_SYNC: "Appointment copied from GHL to Lead Perfection",
  GHL_APPT_STAGE_ADVANCE: "Deal moved forward after the appointment",
  GHL_APPT_CANCELLED_REBOOK_COLD: "Appointment cancelled or no-show — moved to Appointment Rescue (S5.2)",
  AGENTIC_HANDOFF_STARTED: "Chatbot took over the conversation",
  GHL_ATTR_DIGITAL_ENTRY: "Marked as a digital lead (attribution)",
  GHL_ATTR_APPT_BOOKED_VIA_GHL: "Appointment credited to GHL automation (attribution)",
  GHL_ATTR_LP_SALE_NO_GHL: "Sale recorded without GHL involvement (attribution)",
  EMAIL_ENRICH_FROM_LP: "Email address filled in from Lead Perfection",
  INTAKE_ROUTE_BACKSTOP_E0: "New lead routed into E.0 Master Router (backstop)",
  INTAKE_ROUTE_BACKSTOP_OTHER: "New lead routed into E.5 Unknown Source Bridge (backstop)",
  INTAKE_ROUTE_BACKSTOP_HID: "New lead routed into E.7 High-Intent Digital Bridge (backstop)",
  HARD_DISQUALIFIED_CLOSEOUT: "Lead disqualified — all automation stopped",
  STATE_ENROLLMENT: "Enrolled in a workflow by the objection handler",
  AUTOMATION_SUPPRESS_ON_BOOKING: "Automation paused for 48 hours after booking",
  SUPPRESS_GUIDE_ON_ACTIVE_SEQUENCE: "Hurricane guide follow-up skipped (already in a sequence)",
  BEHAVIORAL_DNC_REPLY: "Lead texted STOP — texts and calls turned off",
  TAG_DNC_TO_HARDLOSS: "Do-not-contact — deal marked lost",
  DNC_LIFT_ON_REENTRY_E0: "Do-not-contact lifted — lead came back in",
};

const P2_MILESTONES: Record<string, string> = {
  MEASURE: "measured",
  HOA: "HOA approved",
  RTP: "released to production",
  PERMIT_SUBMIT: "permit submitted",
  ORDERED: "product ordered",
  PRODUCT_RECEIVED: "all product received",
  INSTALL_START: "install started",
  COMPLETION: "job completed",
};

/** Jargon → words, applied to a rule's own name when there is no sentence for it. */
const TOKEN_WORDS: [RegExp, string][] = [
  [/\bLP\b/g, "Lead Perfection"],
  [/\bCnf\b/g, "confirmed"],
  [/\bCXL\b/g, "cancelled"],
  [/\bCCC\b/g, "could-not-confirm"],
  [/\bNS\b/g, "no-show"],
  [/\bBO\b/g, "blown-out"],
  [/\bOPPFDN\b/g, "demo-no-sale"],
  [/\bDNC\b/g, "do-not-contact"],
  [/\bDQ\b/g, "disqualified"],
  [/\bTOFU\b/g, "top of funnel"],
  [/\bMV\b/g, "measurement verification"],
  [/\bWE\b/g, "window estimate"],
  [/\bHID\b/g, "high-intent digital"],
  [/\bP[123]\b/g, "pipeline"],
  [/\s*\(v[\d.]+[^)]*\)/g, ""],
  [/\s*->\s*/g, " → "],
];

function humanizeRuleName(name: string): string {
  let s = name.trim();
  for (const [re, w] of TOKEN_WORDS) s = s.replace(re, w);
  return s.replace(/\s+/g, " ").trim();
}

function humanizeRuleKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/\blp\b/g, "Lead Perfection")
    .replace(/\bghl\b/g, "GHL")
    .replace(/\bdnc\b/g, "do-not-contact")
    .replace(/\bappt\b/g, "appointment")
    .replace(/\bdisp\b/g, "status")
    .replace(/\bcnf\b/g, "confirmed")
    .replace(/\bcxl\b/g, "cancelled")
    .replace(/\battr\b/g, "attribution")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * One sentence for a Decision Engine action. `reasoning` is the stored
 * `Rule KEY: <rule name>` text; `technical` is what the expanded row shows.
 */
export function ruleWords(
  ruleKey: string | null | undefined,
  reasoning: string | null | undefined,
): { title: string; technical: string } {
  const key = (ruleKey ?? "").trim();
  const name = (reasoning ?? "").replace(/^Rule\s+\S+:\s*/, "").trim();
  const technical = key ? `Rule ${key}` : "Decision Engine";
  if (key && RULE_SENTENCES[key]) return { title: RULE_SENTENCES[key], technical };
  const milestone = /^P2_MILESTONE_(.+)$/.exec(key);
  if (milestone) {
    const what = P2_MILESTONES[milestone[1] ?? ""] ?? humanizeTagValue(milestone[1]!.toLowerCase());
    return { title: `Job milestone: ${what}`, technical };
  }
  if (name) return { title: `Automation: ${humanizeRuleName(name)}`, technical };
  if (key) return { title: `Automation: ${humanizeRuleKey(key)}`, technical };
  return { title: "Automation ran", technical };
}

// ── LP / GHL system events ───────────────────────────────────────────────
const EVENT_WORDS: Record<string, string> = {
  "contact.created": "Contact created",
  "ghl.contact_created": "Contact created in GHL",
  "canvassing.lead_created": "Canvassing lead created",
  "opportunity.created": "Deal opened",
  "lp.milestone_completed": "Job milestone reached",
  "lp.disposition_changed": "Lead Perfection status changed",
  "agentic.handoff_started": "Chatbot took over the conversation",
  "agentic.action_suppressed": "Chatbot reply held back",
  "ghl.lead_score_changed": "Lead score changed",
  "appt.booking": "Appointment booked",
  "ghl.appointment_booked": "Appointment booked",
  "appt.enrichment_fetch": "Appointment details looked up",
  "email.enrichment_available": "Email address found",
  "ghl.workflow_completed": "Finished a workflow",
  "ghl.workflow_exit": "Left a workflow",
  "ghl.workflow_handoff": "Handed to another workflow",
  "ghl.tag_added": "Tag added",
  "ghl.routing_tags_ensured": "Routing tags checked",
  objection_state_transition: "Objection state changed",
};

export function eventTypeWords(eventType: string | null | undefined, subtype: string | null | undefined): string {
  const t = (eventType ?? "").trim();
  const s = (subtype ?? "").trim();
  const base = EVENT_WORDS[t];
  const sub = s && !/^[0-9a-f-]{20,}$/i.test(s) && !/^[A-Za-z0-9]{20}$/.test(s) ? s : "";
  if (base) return sub ? `${base}: ${humanizeTagValue(sub)}` : base;
  if (!t) return "System event";
  const words = t
    .replace(/^(ghl|lp|five9|appt|agentic|email|canvassing)\./, (m) => `${{ ghl: "GHL", lp: "Lead Perfection", five9: "Dialer", appt: "Appointment", agentic: "Chatbot", email: "Email", canvassing: "Canvassing" }[m.slice(0, -1)]}: `)
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cap = words.replace(/^\w/, (c) => c.toUpperCase());
  return sub ? `${cap} (${humanizeTagValue(sub)})` : cap;
}

// ── Workflows and tags ───────────────────────────────────────────────────
/** "S2.2" → "S2.2 Chatbot Indoctrination" when the registry knows it. */
export function workflowLabel(code: string, registry: readonly RegistryEntry[]): string {
  const reg = resolveWorkflowCode(code, registry);
  const name = reg?.canonical_name ?? null;
  // Some events carry the full name ("E.2 Calculator Bridge v2"), not a code;
  // only a short code is safe to upper-case.
  const c = reg?.canonical_code ?? (/^[A-Za-z]{1,4}[\d.]*(-[A-Za-z0-9]+)?$/.test(code.trim()) ? code.trim().toUpperCase() : code.trim());
  if (!name) return c;
  return name.toUpperCase().startsWith(c.toUpperCase()) ? name : `${c} ${name}`;
}

/** "E.0 sent this lead to E.4 Canvassing & In-Person Bridge (canvassing path)". */
export function branchFiredWords(
  wf: string,
  branch: string | null | undefined,
  destination: string | null | undefined,
  registry: readonly RegistryEntry[],
): string {
  const from = workflowLabel(wf, registry);
  const path = branch ? ` (${humanizeTagValue(branch)} path)` : "";
  if (destination) return `${from} sent this lead to ${workflowLabel(destination, registry)}${path}`;
  return `${from} picked a path${path}`;
}

/** A tag as a person would say it. */
export function tagWords(tag: string, registry: readonly RegistryEntry[]): string {
  const p = parseTag(tag);
  switch (p.kind) {
    case "active_workflow":
      return `In ${workflowLabel(p.code, registry)}`;
    case "sent":
      return `${p.channel === "email" ? "Email" : "SMS"} ${p.n} of ${workflowLabel(p.code, registry)} sent`;
    case "stage":
      return `Stage: ${humanizeTagValue(p.value)}`;
    case "entry":
      return `${p.active ? "Lead type" : "Came in as"}: ${humanizeTagValue(p.value)}`;
    case "lp_route":
      return `Lead Perfection route: ${humanizeTagValue(p.value)}`;
    case "lp_status":
      return `Lead Perfection: lead ${humanizeTagValue(p.value)}`;
    case "bot":
      return p.value === "agentic-active" ? "Chatbot on" : p.value === "stop-bot" ? "Chatbot stopped" : humanizeTagValue(p.value);
    default:
      return humanizeTagValue(tag);
  }
}
