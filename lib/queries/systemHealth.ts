import { lpService } from "@/lib/supabase/lp";
import { fetchAllPages } from "@/lib/queries/fetchAllPages";
import { isMissingRelation } from "@/lib/queries/pgErrors";
import {
  buildTimelines,
  shapeSystems,
  timelineProblems,
  toCheckView,
  type CheckLatestRaw,
  type CheckView,
  type ResultPoint,
  type ResultRaw,
  type Segment,
  type SystemGroup,
  type TimelineProblem,
} from "@/lib/queries/systemHealth.core";
import type { IncidentRaw } from "@/lib/queries/incidents.core";

/**
 * /system-health reads (LP-MCP System Health, 2026-10-15): the latest result
 * per check, and the last 24h of results for the per-system timelines. Read
 * with the service-role client (the views are service_role only: `detail`
 * names leads). A missing view says "needs migration", never a confident zero.
 */

export type HealthPage =
  | { state: "ok"; systems: SystemGroup[]; counts: { red: number; yellow: number; green: number }; lastEvaluatedAt: string | null; timelines: Record<string, Segment[]>; problems: Record<string, TimelineProblem[]> }
  | { state: "missing" }
  | { state: "error"; message: string };

const LATEST_COLS = "check_id,family,system,label,question,severity,cadence,active_window,stale_after_min,warn_rule,fail_rule,config,mode,owner_job_id,business_impact,enabled,last_status,last_observed_at,last_summary,last_value,minutes_since,color";

export async function getSystemHealthPage(nowMs = Date.now()): Promise<HealthPage> {
  try {
    const sb = lpService();
    const latest = await sb.from("v_health_check_latest").select(LATEST_COLS);
    if (isMissingRelation(latest.error)) return { state: "missing" };
    if (latest.error) return { state: "error", message: latest.error.message };
    const rows = (latest.data ?? []) as CheckLatestRaw[];
    const since = new Date(nowMs - 24 * 3_600_000).toISOString();
    const results = await fetchAllPages<ResultRaw & { id: number }>("system-health: health_results 24h", (from, to) =>
      sb.from("health_results").select("id,check_id,status,observed_at,summary").gte("observed_at", since).order("id", { ascending: true }).range(from, to),
    );
    const meta = new Map(rows.map((r) => [r.check_id, { system: r.system, severity: r.severity, label: r.label }]));
    const shaped = shapeSystems(rows);
    return { state: "ok", ...shaped, timelines: buildTimelines(results, meta, nowMs), problems: timelineProblems(results, meta, nowMs) };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export type CheckDetail =
  | { state: "ok"; check: CheckView; config: Record<string, unknown> | null; results: ResultPoint[]; lastDetail: Record<string, unknown> | null; incidents: IncidentRaw[] }
  | { state: "not_found" }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function getCheckDetail(checkId: string): Promise<CheckDetail> {
  try {
    const sb = lpService();
    const latest = await sb.from("v_health_check_latest").select(`${LATEST_COLS},last_detail`).eq("check_id", checkId).limit(1);
    if (isMissingRelation(latest.error)) return { state: "missing" };
    if (latest.error) return { state: "error", message: latest.error.message };
    const row = (latest.data ?? [])[0] as CheckLatestRaw | undefined;
    if (!row) return { state: "not_found" };
    const [res, inc] = await Promise.all([
      sb.from("health_results").select("observed_at,value,status,summary").eq("check_id", checkId).order("observed_at", { ascending: false }).limit(100),
      sb.from("incidents").select("*").eq("check_id", checkId).order("opened_at", { ascending: false }).limit(20),
    ]);
    if (res.error) return { state: "error", message: res.error.message };
    const results: ResultPoint[] = ((res.data ?? []) as { observed_at: string; value: number | string | null; status: string; summary: string | null }[])
      .reverse()
      .map((r) => ({ at: r.observed_at, value: r.value === null ? null : Number(r.value), status: r.status, summary: r.summary }));
    return {
      state: "ok",
      check: toCheckView(row),
      config: row.config,
      results,
      lastDetail: row.last_detail ?? null,
      incidents: (inc.data ?? []) as IncidentRaw[],
    };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
