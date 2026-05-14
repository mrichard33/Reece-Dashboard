import { McpClient } from "./client";
import type { SyncHealth, RailwayServiceStatus } from "@/lib/supabase/types";

const client = new McpClient(
  process.env.HL_MCP_URL ?? "",
  process.env.HL_MCP_AUTH_TOKEN,
  "hl",
);

export type ContaminationFinding = {
  workflow_id: string;
  workflow_name: string;
  canonical_code: string | null;
  violation: string;
  detail: string;
};

export type NamespaceViolation = {
  contact_id: string;
  contact_name: string | null;
  namespace: string;
  conflicting_tags: string[];
};

export const hlMcp = {
  /** Sync health for the HL cache. Drives the freshness banner on every HL-backed page. */
  getSyncHealth: () =>
    client.call<SyncHealth>("get_sync_health", { revalidate: 60 }),

  /** Railway deployment status for the HL MCP service itself. */
  getRailwayServiceStatus: () =>
    client.call<RailwayServiceStatus>("get_railway_service_status", {
      revalidate: 60,
    }),

  /** Workflows whose copy levers conflict with their stage / lever / pressure assignments. */
  checkContamination: () =>
    client.call<{ rows: ContaminationFinding[] }>("check_contamination", {
      revalidate: 300,
    }),

  /** Contacts holding two or more tags inside an exclusive namespace (active-entry, stage, buyer). */
  auditNamespaceViolations: () =>
    client.call<{ rows: NamespaceViolation[] }>("audit_namespace_violations", {
      revalidate: 300,
    }),

  /** Manual sync trigger. */
  triggerSync: () =>
    client.call<{ ok: boolean; jobId?: string }>("sync_all_entities", {
      method: "POST",
    }),
};
