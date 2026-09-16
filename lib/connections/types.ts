import type { DotStatus } from "@/components/ui/StatusDot";
import type { BadgeTone } from "@/components/ui/Badge";

/**
 * One row per external service on the Settings → Integrations grid.
 *
 * The shape and the rule behind it are borrowed from the Founder OS
 * connectors pattern (MIT): every check returns an honest status, and a check
 * never reports `connected` unless it actually reached the service. The
 * `unknown` state is the tri-state rule from LP-MCP's alert layer applied to
 * a screen — a probe that could not run is not a pass, so it never renders
 * green. That is the difference between "quiet because healthy" and "quiet
 * because nobody looked", which is how the 47-hour and 71-day outages hid.
 */
export type ConnectorState =
  | "connected"
  | "degraded"
  | "not_configured"
  | "error"
  | "unknown";

export type ConnectorGroup = "data" | "services" | "dialer" | "notify" | "automation";

export type ConnectorStatus = {
  id: string;
  name: string;
  group: ConnectorGroup;
  state: ConnectorState;
  /** Human sentence: what was found, or exactly which env var to set. */
  detail: string;
  /** ISO timestamp of the probe. */
  checkedAt: string;
  latencyMs?: number;
  meta?: Record<string, string | number | null>;
};

export const CONNECTOR_STATES: readonly ConnectorState[] = [
  "connected",
  "degraded",
  "not_configured",
  "error",
  "unknown",
];

export function isConnectorState(v: unknown): v is ConnectorState {
  return typeof v === "string" && (CONNECTOR_STATES as readonly string[]).includes(v);
}

/** Dot color per state. `unknown` and `not_configured` are grey on purpose. */
export function dotFor(state: ConnectorState): DotStatus {
  switch (state) {
    case "connected":
      return "healthy";
    case "degraded":
      return "warning";
    case "error":
      return "critical";
    default:
      return "neutral";
  }
}

/** Badge tone + label per state, so every surface words a state the same way. */
export function badgeFor(state: ConnectorState): { tone: BadgeTone; label: string } {
  switch (state) {
    case "connected":
      return { tone: "emerald", label: "Connected" };
    case "degraded":
      return { tone: "amber", label: "Degraded" };
    case "error":
      return { tone: "rose", label: "Error" };
    case "not_configured":
      return { tone: "slate", label: "Not configured" };
    default:
      return { tone: "slate", label: "Unknown" };
  }
}

export const GROUP_LABELS: Record<ConnectorGroup, string> = {
  data: "Data",
  services: "Services",
  dialer: "Dialer",
  notify: "Notifications",
  automation: "Automation",
};

/** Display order for groups on the grid. */
export const GROUP_ORDER: readonly ConnectorGroup[] = [
  "services",
  "data",
  "dialer",
  "notify",
  "automation",
];

export type ConnectorSummary = Record<ConnectorState, number> & { total: number };

export function summarize(rows: ConnectorStatus[]): ConnectorSummary {
  const out: ConnectorSummary = {
    connected: 0,
    degraded: 0,
    not_configured: 0,
    error: 0,
    unknown: 0,
    total: rows.length,
  };
  for (const r of rows) out[r.state] += 1;
  return out;
}

/** "9 connected · 1 degraded · 2 unknown" — zero counts are left out. */
export function summaryLine(s: ConnectorSummary): string {
  const parts: string[] = [];
  const word: Record<ConnectorState, string> = {
    connected: "connected",
    degraded: "degraded",
    error: "error",
    not_configured: "not configured",
    unknown: "unknown",
  };
  for (const state of CONNECTOR_STATES) {
    if (s[state] > 0) parts.push(`${s[state]} ${word[state]}`);
  }
  return parts.length ? parts.join(" · ") : "No integrations checked";
}

/** Rows grouped in display order; empty groups are omitted. */
export function groupRows(
  rows: ConnectorStatus[],
): { group: ConnectorGroup; label: string; rows: ConnectorStatus[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    rows: rows.filter((r) => r.group === group),
  })).filter((g) => g.rows.length > 0);
}
