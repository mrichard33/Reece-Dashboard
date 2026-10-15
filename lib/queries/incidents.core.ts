/**
 * /incidents view-model — pure, no I/O.
 *
 * LP-MCP opens one incident per problem (fingerprint) and moves it through a
 * fixed set of states (src/health/incidents.js); `v_incident_board` lists the
 * open ones, P1 first, then by age. The words here mirror LP-MCP's Slack card
 * (src/health/incident-card.js STATUS_LABEL) so the card and the page describe
 * one incident one way.
 */

import type { BadgeTone } from "@/components/ui/Badge";

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  fix_proposed: "Fix proposed",
  approved: "Fix approved",
  fixing: "Fixing",
  verifying: "Checking it stays fixed",
  resolved: "Resolved",
  closed_no_action: "Closed (no action)",
  snoozed: "Snoozed",
};

export const OPEN_STATUSES = ["open", "acknowledged", "investigating", "fix_proposed", "approved", "fixing", "verifying", "snoozed"] as const;

export const SEVERITY_TONE: Record<string, BadgeTone> = { P1: "rose", P2: "amber", P3: "sky", P4: "slate" };

export function statusTone(status: string): BadgeTone {
  if (status === "open") return "rose";
  if (status === "resolved") return "emerald";
  if (status === "closed_no_action" || status === "snoozed") return "slate";
  if (status === "verifying") return "sky";
  return "amber";
}

export type IncidentRaw = {
  id: number;
  fingerprint: string;
  check_id: string;
  system: string;
  severity: string;
  status: string;
  title: string;
  summary: string | null;
  business_impact: string | null;
  est_value_at_risk: number | string | null;
  occurrence_count: number;
  opened_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  verified_by?: string | null;
  snooze_until: string | null;
  known_issue_id: number | null;
  slack_channel: string | null;
  slack_ts: string | null;
  data: Record<string, unknown> | null;
  check_label?: string | null;
  family?: string | null;
  event_count?: number | string | null;
  latest_finding?: string | null;
  actions_waiting?: number | string | null;
};

export type IncidentRow = {
  id: number;
  title: string;
  severity: string;
  status: string;
  statusLabel: string;
  system: string;
  family: string | null;
  checkId: string;
  checkLabel: string | null;
  summary: string | null;
  businessImpact: string | null;
  valueAtRisk: number | null;
  openedAt: string;
  ageMin: number;
  acknowledgedBy: string | null;
  occurrences: number;
  flapping: boolean;
  source: string | null;
  ttaMin: number | null;
  ttrMin: number | null;
};

const SEV_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

export function toIncidentRow(r: IncidentRaw, nowMs: number): IncidentRow {
  const opened = Date.parse(r.opened_at);
  const v = r.est_value_at_risk === null || r.est_value_at_risk === undefined ? null : Number(r.est_value_at_risk);
  const mins = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.parse(iso) - opened) / 60_000)) : null);
  return {
    id: Number(r.id),
    title: r.title,
    severity: r.severity,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? r.status,
    system: r.system,
    family: r.family ?? null,
    checkId: r.check_id,
    checkLabel: r.check_label ?? null,
    summary: r.summary,
    businessImpact: r.business_impact,
    valueAtRisk: v !== null && Number.isFinite(v) && v > 0 ? v : null,
    openedAt: r.opened_at,
    ageMin: Math.max(0, Math.round((nowMs - opened) / 60_000)),
    acknowledgedBy: r.acknowledged_by,
    occurrences: r.occurrence_count ?? 1,
    flapping: Boolean((r.data as { flapping?: boolean } | null)?.flapping),
    source: ((r.data as { source?: string } | null)?.source) ?? null,
    ttaMin: mins(r.acknowledged_at),
    ttrMin: mins(r.resolved_at),
  };
}

export type BoardFilters = { status?: string | null; system?: string | null; severity?: string | null; mine?: string | null };

/** Open board: filtered, P1 first, then oldest first. Pure. */
export function shapeBoard(rows: IncidentRaw[], nowMs: number, f: BoardFilters = {}): IncidentRow[] {
  return rows
    .filter((r) => (!f.status || r.status === f.status)
      && (!f.system || r.system === f.system)
      && (!f.severity || r.severity === f.severity)
      && (!f.mine || r.acknowledged_by === f.mine))
    .map((r) => toIncidentRow(r, nowMs))
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || b.ageMin - a.ageMin);
}

function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  const hi = v[mid] ?? 0;
  return v.length % 2 ? hi : Math.round(((v[mid - 1] ?? hi) + hi) / 2);
}

/** Closed tab: newest first, with median time to acknowledge and to resolve. Pure. */
export function shapeClosed(rows: IncidentRaw[], nowMs: number): { rows: IncidentRow[]; medianTtaMin: number | null; medianTtrMin: number | null } {
  const out = rows.map((r) => toIncidentRow(r, nowMs)).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return {
    rows: out,
    medianTtaMin: median(out.map((r) => r.ttaMin).filter((x): x is number => x !== null)),
    medianTtrMin: median(out.map((r) => r.ttrMin).filter((x): x is number => x !== null)),
  };
}

export type EventRaw = { id: number; at: string; actor: string; kind: string; body: string | null; data: Record<string, unknown> | null };

const KIND_LABEL: Record<string, string> = {
  opened: "Opened",
  result: "Check result",
  reopened: "Came back",
  acknowledged: "Acknowledged",
  investigation_started: "Investigation started",
  investigated: "Investigated",
  fix_proposed: "Fix proposed",
  approved: "Fix approved",
  rejected: "Fix rejected",
  executed: "Fix applied",
  verified: "Verified",
  resolved: "Resolved",
  closed_no_action: "Closed with no action",
  snoozed: "Snoozed",
  escalated: "Reminder sent",
  note: "Note",
  slack_posted: "Posted to Slack",
};

/** The timeline, oldest first, in plain words. Pure. */
export function shapeTimeline(events: EventRaw[]): { id: number; at: string; who: string; what: string; body: string | null }[] {
  return [...events]
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .map((e) => ({ id: Number(e.id), at: e.at, who: e.actor === "system" ? "System" : e.actor === "aios" ? "AI OS" : e.actor, what: KIND_LABEL[e.kind] ?? e.kind, body: e.body }));
}

/** Affected leads carried in the incident detail (same shape as the Slack card). */
export type AffectedLead = { lp_lead_id?: string | null; name?: string | null; phone10?: string | null; source?: string | null; waiting_min?: number | null; est_value?: number | null };

export function affectedLeads(data: Record<string, unknown> | null): AffectedLead[] {
  const detail = (data?.detail ?? null) as { leads?: unknown } | null;
  return Array.isArray(detail?.leads) ? (detail!.leads as AffectedLead[]).slice(0, 50) : [];
}

/** "1h 5m" for minutes. Pure. */
export function formatDuration(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Slack permalink for a card (channel + ts), or null. */
export function slackLink(channel: string | null, ts: string | null): string | null {
  if (!channel || !ts) return null;
  return `https://slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}
