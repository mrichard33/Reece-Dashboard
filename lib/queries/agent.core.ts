import type { DotStatus } from "@/components/ui/StatusDot";
import type { BadgeTone } from "@/components/ui/Badge";
import type { JobStatusRow } from "@/lib/supabase/types";

/**
 * Pure view-model for the /agent job roster. No I/O, so it tests without a
 * Supabase harness (the `.core.ts` convention used by cohorts / reportFacts /
 * scorecardAggregate).
 *
 * The two states that do not come from the database are the point of the
 * screen:
 *
 *   never     a registered, ENABLED job with no runs at all. This is the
 *             signal the whole feature exists for — before job_runs there was
 *             no way to see a job that had quietly stopped happening.
 *   disabled  a job switched off on purpose. LP-MCP resolves its own env gate
 *             at boot and stores the answer, because the dashboard cannot read
 *             that service's variables. Without it, every deliberately dark job
 *             would read as "never run", and an alarm that fires on the healthy
 *             case is how a board gets muted (LP-MCP CLAUDE.md).
 */

export type JobHealth =
  | "ok"
  | "failed"
  | "unknown"
  | "interrupted"
  | "skipped"
  | "running"
  | "never"
  | "disabled";

export type JobRow = {
  id: string;
  label: string;
  group: string;
  cadence: string | null;
  health: JobHealth;
  /** Env var that switched it off, when health is `disabled`. */
  disabledBy: string | null;
  lastStartedAt: string | null;
  lastElapsedMs: number | null;
  lastSummary: string | null;
  runs24h: number;
  failed24h: number;
  unknown24h: number;
};

const KNOWN_STATUSES = new Set<JobHealth>([
  "ok",
  "failed",
  "unknown",
  "interrupted",
  "skipped",
  "running",
]);

export function toJobRow(row: JobStatusRow): JobRow {
  let health: JobHealth;
  if (row.enabled === false) {
    health = "disabled";
  } else if (!row.last_status) {
    health = "never";
  } else if (KNOWN_STATUSES.has(row.last_status as JobHealth)) {
    health = row.last_status as JobHealth;
  } else {
    // A status the database allowed but this build does not know. Never
    // silently render it as fine.
    health = "unknown";
  }

  return {
    id: row.job_id,
    label: row.label,
    group: row.job_group,
    cadence: row.cadence,
    health,
    disabledBy: health === "disabled" ? row.enabled_env : null,
    lastStartedAt: row.last_started_at,
    lastElapsedMs: row.last_elapsed_ms,
    lastSummary: row.last_summary,
    runs24h: row.runs_24h ?? 0,
    failed24h: row.failed_24h ?? 0,
    unknown24h: row.unknown_24h ?? 0,
  };
}

export function toJobRows(rows: JobStatusRow[]): JobRow[] {
  return rows.map(toJobRow);
}

/**
 * Dot colour per health.
 *
 * `unknown` is amber, not grey: unlike a connection probe that could not run,
 * a job in this state DID run and could not reach a conclusion, which is a
 * real signal. `never` is amber for the same reason — a job that should have
 * run and has not is the thing this page was built to surface.
 *
 * `interrupted` and `skipped` are neutral on purpose. A deploy killing a pass
 * is infrastructure, and a re-entrancy guard declining to start is the system
 * working. Colouring either as a fault is how a board gets ignored.
 */
export function jobDot(health: JobHealth): DotStatus {
  switch (health) {
    case "ok":
      return "healthy";
    case "failed":
      return "critical";
    case "unknown":
    case "never":
      return "warning";
    default:
      return "neutral";
  }
}

export function jobBadge(health: JobHealth): { tone: BadgeTone; label: string } {
  switch (health) {
    case "ok":
      return { tone: "emerald", label: "OK" };
    case "failed":
      return { tone: "rose", label: "Failed" };
    case "unknown":
      return { tone: "amber", label: "Unknown" };
    case "never":
      return { tone: "amber", label: "Never run" };
    case "running":
      return { tone: "sky", label: "Running" };
    case "interrupted":
      return { tone: "slate", label: "Interrupted" };
    case "skipped":
      return { tone: "slate", label: "Skipped" };
    default:
      return { tone: "slate", label: "Disabled" };
  }
}

export type JobRosterSummary = {
  total: number;
  failing: number;
  attention: number;
  disabled: number;
};

/**
 * Counts for the card header. `attention` deliberately includes `never` and
 * `unknown` alongside failures: a job that has not run is exactly as much of a
 * problem as one that ran and broke, and it is the easier one to miss.
 */
export function summarizeJobs(rows: JobRow[]): JobRosterSummary {
  return {
    total: rows.length,
    failing: rows.filter((r) => r.health === "failed").length,
    attention: rows.filter((r) => r.health === "never" || r.health === "unknown").length,
    disabled: rows.filter((r) => r.health === "disabled").length,
  };
}

/** "12 jobs · 1 failing · 2 need a look · 2 disabled" — zero counts are left out. */
export function jobSummaryLine(s: JobRosterSummary): string {
  if (s.total === 0) return "No jobs registered";
  const parts = [`${s.total} ${s.total === 1 ? "job" : "jobs"}`];
  if (s.failing > 0) parts.push(`${s.failing} failing`);
  if (s.attention > 0) parts.push(`${s.attention} need a look`);
  if (s.disabled > 0) parts.push(`${s.disabled} disabled`);
  return parts.join(" · ");
}

/** "1.2s" / "340ms" / "2m 04s" — durations read at a glance, not in milliseconds. */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}
