/**
 * Minimal hand-typed Supabase schemas for Phase 1.
 *
 * Replace by running `npm run types:generate:lp` and `npm run types:generate:hl`
 * once the project IDs are set in env. Until then, these cover only what the
 * Phase 1 pages and queries touch.
 */

// ─────────────────────────────────────────────────────────────────────────────
// LP Supabase (lp_*, agent_*, claude_*, system_events, groupme_approval_requests)
// ─────────────────────────────────────────────────────────────────────────────

export type AgentEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type SystemEvent = {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  priority: "low" | "normal" | "high" | "critical" | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type LpLead = {
  id: string;
  created_at: string;
  source: string | null;
  disposition: string | null;
  rep: string | null;
};

export type GroupmeApprovalRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  action_type: string;
  contact_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type ClaudeKnownIssue = {
  id: string;
  severity: "low" | "medium" | "high" | "critical" | null;
  description: string;
  owner: string | null;
  opened_at: string;
  resolved_at: string | null;
};

export type DashboardUser = {
  email: string;
  role: "operator" | "team";
  created_at: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// HL Supabase (contacts, opportunities, workflows)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// MCP response shapes (HTTP-passthrough, not Supabase rows)
// ─────────────────────────────────────────────────────────────────────────────

export type SyncHealth = {
  last_sync_at: string | null;
  status: "healthy" | "stale" | "error" | "unknown";
  details?: Record<string, unknown>;
};

export type RailwayServiceStatus = {
  service: string;
  status: "running" | "stopped" | "error" | "unknown";
  last_deploy_at: string | null;
  details?: Record<string, unknown>;
};
