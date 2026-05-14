import { McpClient } from "./client";
import type { SyncHealth } from "@/lib/supabase/types";

const client = new McpClient(
  process.env.LP_MCP_URL ?? "",
  process.env.LP_MCP_AUTH_TOKEN,
  "lp",
);

export type DriftCandidate = {
  contact_id: string;
  name: string | null;
  reason: string;
  ghl_status: string | null;
  lp_status: string | null;
  last_lp_activity_at: string | null;
};

export const lpMcp = {
  /** Sync health for the LP cache. */
  getSyncHealth: () =>
    client.call<SyncHealth>("get_sync_health", { revalidate: 60 }),

  /** Contacts marked closed/won in GHL but still active in LP. */
  getDriftCandidates: () =>
    client.call<{ rows: DriftCandidate[] }>("get_drift_candidates", {
      revalidate: 300,
    }),

  /** Manual sync trigger — wired to the "Sync now" button. */
  triggerSync: () =>
    client.call<{ ok: boolean; jobId?: string }>("sync_all_entities", {
      method: "POST",
    }),
};
