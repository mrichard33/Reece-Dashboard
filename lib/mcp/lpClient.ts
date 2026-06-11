import { unstable_cache } from "next/cache";
import { McpClient } from "./client";
import type { SyncHealthRaw } from "@/lib/supabase/types";

const rawToken = process.env.LP_MCP_AUTH_TOKEN;
const authToken =
  typeof rawToken === "string" && rawToken.trim().length > 0
    ? rawToken.trim()
    : undefined;

const client = new McpClient(process.env.LP_MCP_URL ?? "", authToken, "lp");

/** Whether LP_MCP_URL is set on the dashboard (vs. unconfigured). */
export const lpUrlConfigured = (process.env.LP_MCP_URL ?? "").trim().length > 0;
/**
 * Whether LP_MCP_AUTH_TOKEN is set on the dashboard. Lets the UI distinguish
 * "no token configured" from "token configured but rejected (stale)" — never
 * exposes the value itself.
 */
export const lpTokenConfigured = authToken !== undefined;

export type DriftCandidate = {
  contact_id: string;
  name: string | null;
  reason: string;
  ghl_status: string | null;
  lp_status: string | null;
  last_lp_activity_at: string | null;
};

export const lpMcp = {
  /** Sync health for the LP cache. Returns the raw nested MCP response. */
  getSyncHealth: unstable_cache(
    () => client.call<SyncHealthRaw>("get_sync_health"),
    ["lp-mcp", "get_sync_health"],
    { revalidate: 60, tags: ["lp-mcp"] },
  ),

  /** Contacts marked closed/won in GHL but still active in LP. */
  getDriftCandidates: unstable_cache(
    () => client.call<{ rows: DriftCandidate[] }>("get_drift_candidates"),
    ["lp-mcp", "get_drift_candidates"],
    { revalidate: 300, tags: ["lp-mcp"] },
  ),

  /** Manual sync trigger — wired to the "Sync now" button. */
  triggerSync: () =>
    client.call<{ ok?: boolean; status?: string; message?: string }>(
      "sync_all_entities",
      { timeoutMs: 30_000 },
    ),

  /**
   * Uncached liveness probe for the Connections panel — the cheapest tool, run
   * fresh so the operator sees the real current auth/reachability state.
   */
  ping: () => client.call<SyncHealthRaw>("get_sync_health"),
};
