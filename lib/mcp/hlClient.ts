import { unstable_cache } from "next/cache";
import { McpClient } from "./client";
import type { SyncHealth, RailwayServiceStatus } from "@/lib/supabase/types";

const rawToken = process.env.HL_MCP_AUTH_TOKEN;
const authToken =
  typeof rawToken === "string" && rawToken.trim().length > 0
    ? rawToken.trim()
    : undefined;

const client = new McpClient(process.env.HL_MCP_URL ?? "", authToken, "hl");

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
  getSyncHealth: unstable_cache(
    () => client.call<SyncHealth>("get_sync_health"),
    ["hl-mcp", "get_sync_health"],
    { revalidate: 60, tags: ["hl-mcp"] },
  ),

  /** Railway deployment status for the HL MCP service itself. */
  getRailwayServiceStatus: unstable_cache(
    () => client.call<RailwayServiceStatus>("get_railway_service_status"),
    ["hl-mcp", "get_railway_service_status"],
    { revalidate: 60, tags: ["hl-mcp"] },
  ),

  /** Workflows whose copy levers conflict with their stage / lever / pressure assignments. */
  checkContamination: unstable_cache(
    () => client.call<{ rows: ContaminationFinding[] }>("check_contamination"),
    ["hl-mcp", "check_contamination"],
    { revalidate: 300, tags: ["hl-mcp"] },
  ),

  /** Contacts holding two or more tags inside an exclusive namespace (active-entry, stage, buyer). */
  auditNamespaceViolations: unstable_cache(
    () =>
      client.call<{ rows: NamespaceViolation[] }>("audit_namespace_violations"),
    ["hl-mcp", "audit_namespace_violations"],
    { revalidate: 300, tags: ["hl-mcp"] },
  ),

  /** Manual sync trigger. */
  triggerSync: () =>
    client.call<{ ok: boolean; jobId?: string }>("sync_all_entities", {
      method: "POST",
    }),
};
