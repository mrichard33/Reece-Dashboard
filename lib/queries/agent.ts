import { lpService } from "@/lib/supabase/lp";
import { isMissingColumn, isMissingRelation } from "@/lib/queries/pgErrors";
import { getHeartbeat } from "@/lib/queries/health";
import { toJobRows, type JobRow } from "@/lib/queries/agent.core";
import type { AgentRule, JobStatusRow } from "@/lib/supabase/types";

/**
 * /agent (Decision Engine) reads. Everything comes from LP Supabase through the
 * service client — one transport for the whole page.
 *
 * Read-only by construction. The rules shown here are database config, and the
 * only sanctioned way to change them is the LP MCP tool (LP-MCP CLAUDE.md);
 * this page never writes one.
 *
 * Every section degrades on its own. The job roster in particular ships in a
 * migration that lives in the OTHER repo (LP-MCP sql/113_job_runs.sql) and may
 * not be applied when this deploys, so a missing view returns
 * `needsMigration` and the card names the file instead of rendering an empty
 * roster that reads as "no jobs".
 */

/** Named so the UI can print the file to apply rather than "a migration". */
export const JOB_RUNS_MIGRATION = {
  file: "sql/113_job_runs.sql",
  repo: "LP-MCP",
} as const;

export type AgentVitals = {
  pendingEvents: number | null;
  pendingActions: number | null;
  executed24h: number | null;
  failed24h: number | null;
  activeRules: number | null;
  inactiveRules: number | null;
};

export type AgentPageData = {
  jobs: JobRow[];
  jobsNeedMigration: boolean;
  vitals: AgentVitals;
  rules: AgentRule[];
  heartbeat: { lastTickAt: string | null; minutesAgo: number | null };
  /** Per-section failure text, keyed by section. Absent key = section is fine. */
  errors: Record<string, string>;
};

type Section<T> = { value: T; error?: string };

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<Section<T>> {
  try {
    return { value: await fn() };
  } catch (e) {
    return { value: fallback, error: e instanceof Error ? e.message : `Failed: ${label}` };
  }
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

/**
 * The job roster. Three distinct outcomes, never conflated: env missing is an
 * error, an absent view is `needsMigration`, and a real failure is an error.
 */
export async function getJobRoster(): Promise<{
  jobs: JobRow[];
  needsMigration: boolean;
  error: string | null;
}> {
  const empty = { jobs: [] as JobRow[], needsMigration: false, error: null };

  let sb;
  try {
    sb = lpService();
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const { data, error } = await sb.from("v_job_status").select("*");

  if (error) {
    // isMissingColumn matters as much as isMissingRelation: sql/113 adds
    // `enabled` with ALTER ... IF NOT EXISTS, so a half-applied migration
    // leaves the view present but short a column, and a silent empty roster
    // would look exactly like "no jobs are registered".
    if (isMissingRelation(error) || isMissingColumn(error)) {
      return { ...empty, needsMigration: true };
    }
    return { ...empty, error: error.message };
  }

  return { jobs: toJobRows((data ?? []) as JobStatusRow[]), needsMigration: false, error: null };
}

/** Decision-engine vitals: the numbers the frozen prototype asked for. */
export async function getAgentVitals(): Promise<AgentVitals> {
  const sb = lpService();
  const since = hoursAgo(24);
  const head = { count: "exact" as const, head: true };

  // An action can be completed long after it was filed, so the 24h window is on
  // when it RAN, not when it was created. updated_at is the fallback for rows
  // whose executed_at was never stamped.
  const ran24h = `executed_at.gte.${since},updated_at.gte.${since}`;

  const [pendingEvents, pendingActions, executed, failed, active, inactive] = await Promise.all([
    sb.from("system_events").select("id", head).eq("processed", false),
    sb.from("agent_actions").select("id", head).in("status", ["pending", "pending_approval"]),
    sb.from("agent_actions").select("id", head).eq("status", "completed").or(ran24h),
    sb.from("agent_actions").select("id", head).eq("status", "failed").or(ran24h),
    sb.from("agent_rules").select("id", head).eq("enabled", true),
    sb.from("agent_rules").select("id", head).eq("enabled", false),
  ]);

  // One bad count must not be rendered as a confident zero.
  const failure = [pendingEvents, pendingActions, executed, failed, active, inactive].find(
    (r) => r.error,
  );
  if (failure?.error) throw new Error(failure.error.message);

  return {
    pendingEvents: pendingEvents.count ?? 0,
    pendingActions: pendingActions.count ?? 0,
    executed24h: executed.count ?? 0,
    failed24h: failed.count ?? 0,
    activeRules: active.count ?? 0,
    inactiveRules: inactive.count ?? 0,
  };
}

/** The rules themselves. Disabled first is deliberate — those are the surprising ones. */
export async function getAgentRules(): Promise<AgentRule[]> {
  const sb = lpService();
  const { data, error } = await sb
    .from("agent_rules")
    .select("id, rule_key, rule_name, category, enabled, priority, requires_approval, updated_at")
    .order("enabled", { ascending: true })
    .order("priority", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentRule[];
}

const NO_VITALS: AgentVitals = {
  pendingEvents: null,
  pendingActions: null,
  executed24h: null,
  failed24h: null,
  activeRules: null,
  inactiveRules: null,
};

export async function getAgentPageData(): Promise<AgentPageData> {
  const [roster, vitals, rules, heartbeat] = await Promise.all([
    getJobRoster(),
    safe("vitals", getAgentVitals, NO_VITALS),
    safe("rules", getAgentRules, [] as AgentRule[]),
    getHeartbeat(),
  ]);

  const errors: Record<string, string> = {};
  if (roster.error) errors.jobs = roster.error;
  if (vitals.error) errors.vitals = vitals.error;
  if (rules.error) errors.rules = rules.error;

  return {
    jobs: roster.jobs,
    jobsNeedMigration: roster.needsMigration,
    vitals: vitals.value,
    rules: rules.value,
    heartbeat,
    errors,
  };
}
