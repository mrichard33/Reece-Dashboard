import { unstable_cache } from "next/cache";
import { McpClient } from "./client";
import type { HlSyncHealthRaw, RailwayStatusRaw } from "@/lib/supabase/types";

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
  /** Sync health for the HL cache (raw nested MCP response). */
  getSyncHealth: unstable_cache(
    () => client.call<HlSyncHealthRaw>("get_sync_health"),
    ["hl-mcp", "get_sync_health"],
    { revalidate: 60, tags: ["hl-mcp"] },
  ),

  /** Railway deployment status for the HL MCP service (raw `deployments.edges` shape). */
  getRailwayServiceStatus: unstable_cache(
    () => client.call<RailwayStatusRaw>("get_railway_service_status"),
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

  /**
   * Manual sync trigger. HL's sync_all_entities awaits the full per-entity sync
   * inline and returns a per-entity results record, so it gets a longer ceiling.
   */
  triggerSync: () =>
    client.call<Record<string, unknown>>("sync_all_entities", {
      timeoutMs: 60_000,
    }),
};
