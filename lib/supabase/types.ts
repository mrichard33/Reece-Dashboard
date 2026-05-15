/**
 * Minimal hand-typed Supabase schemas for Phase 1.
 *
 * Replace by running `npm run types:generate:lp` and `npm run types:generate:hl`
 * once the project IDs are set in env. Until then, these cover only what the
 * Phase 1 pages and queries touch.
 */

// ──────────────────────────────────────────────────────────────────────
// LP Supabase (lp_*, agent_*, claude_*, system_events, groupme_approval_requests)
// ──────────────────────────────────────────────────────────────────────

export type SystemEvent = {
  id: number;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  priority: "low" | "normal" | "high" | "critical" | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type LpLead = {
  id: string;
  lp_lead_id: string;
  lead_source: string | null;
  disposition_code: string | null;
  disposition_label: string | null;
  rep_id: string | null;
  rep_name: string | null;
  created_at_lp: string | null;
  updated_at_lp: string | null;
  synced_at: string | null;
};

export type GroupmeApprovalRequest = {
  id: number;
  status: "pending" | "approved" | "rejected" | "expired";
  short_ref: string;
  contact_name: string | null;
  rule_applied: string | null;
  created_at: string;
};

export type ClaudeKnownIssue = {
  id: number;
  severity: "low" | "medium" | "high" | "critical" | null;
  category: string | null;
  description: string;
  status: "open" | "closed" | "in_progress" | string;
  reported_date: string;
  resolved_date: string | null;
  workflow_id: string | null;
  workflow_name: string | null;
  impact: string | null;
};

export type DashboardUser = {
  email: string;
  role: "operator" | "team";
  created_at: string;
};

// ──────────────────────────────────────────────────────────────────────
// HL Supabase (contacts, opportunities, workflows)
// ──────────────────────────────────────────────────────────────────────

export type Pipeline = {
  id: string;
  name: string;
  ghl_pipeline_id: string | null;
};

export type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
};

export type Opportunity = {
  id: string;
  pipeline_id: string;
  pipeline_stage_id: string;
  contact_id: string | null;
  status: "open" | "won" | "lost" | "abandoned";
  monetary_value: number | null;
  name: string | null;
  source: string | null;
  updated_at: string;
  created_at: string;
};

export type Workflow = {
  id: string;
  ghl_workflow_id: string;
  name: string;
  status: "published" | "draft" | null;
  last_modified_at: string | null;
  deleted_at: string | null;
};

export type WorkflowRegistry = {
  canonical_code: string;
  workflow_id: string;
  workflow_name: string | null;
  stage_family: string | null;
  psychological_stage: string | null;
  trust_state: string | null;
  message_pressure_level: string | null;
};

// ──────────────────────────────────────────────────────────────────────
// MCP response shapes
// ──────────────────────────────────────────────────────────────────────
//
// Raw shapes match what LP-MCP and HL-MCP `get_sync_health` /
// `get_railway_service_status` actually return. Flat shapes are the adapted
// view consumed by the overview tiles / sync banner via lib/queries/health.ts.

export type SyncEntityStatus = {
  id: string;
  entity_type: string;
  sync_type: string;
  status: "running" | "completed" | "failed" | string;
  records_synced: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type SyncHealthRaw = {
  last_sync_by_entity?: Record<string, SyncEntityStatus | null>;
  currently_running?: Array<{
    entity_type: string;
    sync_type: string;
    records_synced: number;
    started_at: string;
  }>;
  last_24h?: {
    syncs_run: number;
    records_synced: number;
    failed_syncs: number;
  };
  unmapped_sources?: number;
  unfired_milestone_triggers?: number;
  day15_untriggered_leads?: number;
  circuit_breaker?: { consecutiveFailures: number; circuitOpen: boolean };
};

export type SyncHealth = {
  last_sync_at: string | null;
  status: "healthy" | "stale" | "error" | "unknown";
  details?: Record<string, unknown>;
};

export type RailwayDeploymentNode = {
  id: string;
  status:
    | "SUCCESS"
    | "FAILED"
    | "BUILDING"
    | "DEPLOYING"
    | "INITIALIZING"
    | "CRASHED"
    | "REMOVED"
    | string;
  createdAt: string;
};

export type RailwayStatusRaw = {
  name?: string;
  icon?: string | null;
  updatedAt?: string;
  deployments?: { edges?: Array<{ node?: RailwayDeploymentNode }> };
};

export type RailwayServiceStatus = {
  service: string;
  status: "running" | "stopped" | "error" | "unknown";
  last_deploy_at: string | null;
  details?: Record<string, unknown>;
};
