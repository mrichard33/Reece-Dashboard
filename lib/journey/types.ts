/**
 * The Customer Journey model (design spec v1, 2026-09-24, §B8).
 *
 * One merged, time-ordered list per contact, built at READ time from the HL
 * cache (contacts, messages, appointments, opportunities, lead_events) and the
 * LP MCP `get_contact_timeline` tool. The two Supabases are never joined — each
 * side is fetched on its own and merged here by timestamp.
 *
 * `ghl_contact_id` is the key everywhere. LP ids are display + search only.
 */

export type JourneyLane =
  | "message"
  | "call"
  | "appointment"
  | "workflow"
  | "stage"
  | "pipeline"
  | "lp"
  | "bot"
  | "note"
  | "tag"
  | "system";

export type JourneyEvent = {
  /** Stable: `${source}:${sourceId}`. */
  id: string;
  /** ISO UTC. Rendered in ET only at the edge (see lib/utils etTime). */
  ts: string;
  lane: JourneyLane;
  /** e.g. "sms_out", "email_out", "workflow_entered", "appointment_cancelled". */
  kind: string;
  /** One line, plain English, already ET-rendered where it mentions a time. */
  title: string;
  /** Rep name, "Bot", workflow code, rule id. */
  actor?: string;
  /** Body, notes, reasoning, tag diff. Never raw LP payloads. */
  detail?: Record<string, unknown>;
  refs?: {
    workflowCode?: string;
    templateId?: string;
    appointmentId?: string;
    ruleId?: string;
    opportunityId?: string;
  };
  /** True for "what happens next" rows. Never rendered above NOW. */
  projected?: boolean;
  /** For merged tag-change rows. */
  collapsedCount?: number;
  /**
   * Noise the timeline hides unless the row's lane chip is switched on
   * explicitly: skipped Decision Engine actions, raw LP system events, the
   * LP appointment cache. "All" does not show them; the lane chip does.
   */
  quiet?: boolean;
};

export type BotState = "active" | "stopped" | "dnc" | "none";

export type JourneyHeader = {
  ghlContactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  source: string | null;
  entryLane: string | null;
  pipeline: string | null;
  stage: string | null;
  currentWorkflow: { code: string; name: string; ghlWorkflowId: string | null } | null;
  /**
   * Every `active-<code>` the contact carries now (one per lane is normal).
   * `stopped` = the tag is a leftover on a contact whose automation is stopped.
   */
  activeWorkflows: { code: string; name: string; ghlWorkflowId: string | null; stopped: boolean }[];
  stageTag: string | null;
  lp: {
    prospectId: string | null;
    leadId: string | null;
    /** Every LP lead id under this contact — one person can hold several. */
    leadIds: string[];
    disposition: string | null;
    route: string | null;
    rep: string | null;
  };
  bot: BotState;
  tags: string[];
  enteredAt: string | null;
  /** Set when the contact is deleted in GHL — the page still renders. */
  deletedAt: string | null;
};

export type Journey = {
  header: JourneyHeader;
  now: {
    workflowPosition: string | null;
    openAppointment: JourneyEvent | null;
    lastCall: JourneyEvent | null;
    lastMessage: JourneyEvent | null;
    /** Automation stopped / nurture paused — shown instead of projections. */
    suppression: { kind: "stopped" | "texts" | "paused"; reason: string } | null;
  };
  /** Projected, ascending. */
  next: JourneyEvent[];
  stats: {
    messagesOut: number;
    messagesIn: number;
    calls: number;
    appts: number;
    workflows: string[];
    notes: number;
  };
  /** Ascending, past only. */
  events: JourneyEvent[];
  /** Shown as a small banner when degraded. */
  sources: { hl: "ok" | "error"; lp: "ok" | "error" };
  builtAt: string;
};
