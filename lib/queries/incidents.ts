import { lpService } from "@/lib/supabase/lp";
import { isMissingRelation } from "@/lib/queries/pgErrors";
import type { EventRaw, IncidentRaw } from "@/lib/queries/incidents.core";

/**
 * /incidents reads (LP-MCP System Health, 2026-10-15). The open board is
 * `v_incident_board` (P1 first, then age); the closed tab reads `incidents`
 * directly for the last 30 days. Writes never happen here: every action goes
 * through lib/actions/incidents.ts → LP-MCP, which writes the timeline row.
 */

/** `nowMs` is read here, once, so render never reads the clock. */
export type Loaded<T> = { state: "ok"; data: T; nowMs: number } | { state: "missing" } | { state: "error"; message: string };

export async function getOpenIncidents(): Promise<Loaded<IncidentRaw[]>> {
  try {
    const { data, error } = await lpService().from("v_incident_board").select("*").limit(500);
    if (isMissingRelation(error)) return { state: "missing" };
    if (error) return { state: "error", message: error.message };
    return { state: "ok", data: (data ?? []) as IncidentRaw[], nowMs: Date.now() };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function getClosedIncidents(): Promise<Loaded<IncidentRaw[]>> {
  try {
    const nowMs = Date.now();
    const since = new Date(nowMs - 30 * 24 * 3_600_000).toISOString();
    const { data, error } = await lpService().from("incidents").select("*")
      .in("status", ["resolved", "closed_no_action"]).gte("opened_at", since)
      .order("opened_at", { ascending: false }).limit(500);
    if (isMissingRelation(error)) return { state: "missing" };
    if (error) return { state: "error", message: error.message };
    return { state: "ok", data: (data ?? []) as IncidentRaw[], nowMs: Date.now() };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export type IncidentPage = { incident: IncidentRaw; events: EventRaw[]; checkLabel: string | null; knownIssue: { id: number; description: string; status: string } | null; finding: string | null };

export async function getIncident(id: number): Promise<Loaded<IncidentPage> | { state: "not_found" }> {
  try {
    const sb = lpService();
    const { data, error } = await sb.from("incidents").select("*").eq("id", id).limit(1);
    if (isMissingRelation(error)) return { state: "missing" };
    if (error) return { state: "error", message: error.message };
    const incident = (data ?? [])[0] as IncidentRaw | undefined;
    if (!incident) return { state: "not_found" };
    const [ev, check, finding, known] = await Promise.all([
      sb.from("incident_events").select("id,at,actor,kind,body,data").eq("incident_id", id).order("at", { ascending: true }).limit(500),
      sb.from("health_checks").select("label").eq("check_id", incident.check_id).limit(1),
      sb.from("investigation_runs").select("finding").eq("incident_id", id).order("started_at", { ascending: false }).limit(1),
      incident.known_issue_id
        ? sb.from("claude_known_issues").select("id,description,status").eq("id", incident.known_issue_id).limit(1)
        : Promise.resolve({ data: [] as { id: number; description: string; status: string }[], error: null }),
    ]);
    return {
      state: "ok",
      nowMs: Date.now(),
      data: {
        incident,
        events: (ev.data ?? []) as EventRaw[],
        checkLabel: (check.data?.[0] as { label?: string } | undefined)?.label ?? null,
        finding: (finding.data?.[0] as { finding?: string } | undefined)?.finding ?? null,
        knownIssue: (known.data?.[0] as { id: number; description: string; status: string } | undefined) ?? null,
      },
    };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
