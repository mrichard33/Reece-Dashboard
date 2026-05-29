/**
 * Minimal hand-typed Supabase schemas for Phase 1.
 *
 * Replace by running `npm run types:generate:lp` and `npm run types:generate:hl`
 * once the project IDs are set in env. Until then, these cover only what the
 * Phase 1 pages and queries touch.
 */

// ─────────────────────────────────────────────────────────────────
// LP Supabase (lp_*, agent_*, claude_*, system_events, groupme_approval_requests)
// ─────────────────────────────────────────────────────────────────

export type SystemEvent = {
  id: number;
  event_type: string;
  event_subtype: string | null;
  source: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ghl_contact_id: string | null;
  lp_lead_id: string | null;
  lp_prospect_id: string | null;
  priority: "low" | "normal" | "high" | "critical" | null;
  payload: Record<string, unknown> | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Trimmed lp_leads projection used to enrich an activity event with its
 * contact. Joined in JS on `lp_lead_id` (system_events and lp_leads both live
 * in LP Supabase, but we query in parallel and merge rather than SQL-join).
 */
export type LeadLite = {
  lp_lead_id: string;
  lp_prospect_id: string | null;
  ghl_contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  lead_source: string | null;
  lead_source_detail: string | null;
  rep_name: string | null;
  disposition_label: string | null;
  appointment_set: boolean | null;
  demo_completed: boolean | null;
  job_value: number | null;
};

/** A system event with its contact attached (null for system-level events). */
export type ActivityItem = SystemEvent & { lead: LeadLite | null };

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

// ─────────────────────────────────────────────────────────────────
// Executive Review & Showcase (LP Supabase — see db/migrations/0002)
// ─────────────────────────────────────────────────────────────────

export type Executive = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  is_admin: boolean;
  active: boolean;
  created_at: string;
};

export type AssetType =
  | "script"
  | "audio"
  | "video"
  | "framework"
  | "transcript"
  | "system_change"
  | "other";

export type AssetStatus = "draft" | "in_review" | "approved" | "changes_requested";

export type Asset = {
  id: string;
  title: string;
  asset_type: AssetType;
  description: string | null;
  status: AssetStatus;
  created_by: string;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AttachmentKind = "file" | "link" | "text";
export type MediaType = "audio" | "video" | "pdf" | "doc" | "other";

export type AssetAttachment = {
  id: string;
  asset_id: string;
  kind: AttachmentKind;
  label: string;
  storage_path: string | null;
  external_url: string | null;
  inline_text: string | null;
  media_type: MediaType | null;
  sort_order: number;
  created_at: string;
};

export type ApprovalDecision = "pending" | "approved" | "rejected";

export type AssetApproval = {
  id: string;
  asset_id: string;
  executive_id: string;
  required: boolean;
  decision: ApprovalDecision;
  reason: string | null;
  decided_at: string | null;
};

export type ActivityEvent = {
  id: string;
  event_type: string;
  actor_id: string | null;
  asset_id: string | null;
  summary: string;
  created_at: string;
};

export type ActivityCategory = "content" | "automation" | "funnel" | "other";

export type ActivityPost = {
  id: string;
  author_id: string;
  body: string;
  category: ActivityCategory | null;
  created_at: string;
};

export type FeedItem = {
  source: "event" | "post";
  id: string;
  body: string;
  actor_id: string | null;
  asset_id: string | null;
  category: ActivityCategory | null;
  created_at: string;
};

export type AppNotification = {
  id: string;
  recipient_id: string;
  type: string;
  asset_id: string | null;
  body: string;
  read: boolean;
  created_at: string;
};

// ─────────────────────────────────────────────────────────────────
// HL Supabase (contacts, opportunities, workflows)
// ─────────────────────────────────────────────────────────────────

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

/**
 * Cached GHL contact in HL Supabase. `custom_fields` is the JSONB array of
 * `{id, value}` objects that mirrors GHL's custom-field model. Typed as
 * `unknown` because the array's value column is genuinely heterogeneous —
 * extract typed values via helpers in lib/queries/pipelines.ts.
 */
export type HlContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  custom_fields: unknown;
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

// ─────────────────────────────────────────────────────────────────
// MCP response shapes
// ─────────────────────────────────────────────────────────────────
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

/**
 * HL MCP's get_sync_health returns a different shape than LP's: a `sync_state`
 * array (one row per entity) plus a 24h failure-rate summary, rather than
 * LP's `last_sync_by_entity` map + circuit breaker. Adapted by adaptHlSyncHealth.
 */
export type HlSyncStateRow = {
  entity_name: string;
  last_synced_at: string | null;
  updated_at?: string | null;
};

export type HlSyncHealthRaw = {
  sync_state?: HlSyncStateRow[];
  failure_rate_24h?: {
    total_syncs?: number;
    failed_syncs?: number;
    failure_rate?: string;
  };
  cache_counts?: Record<string, number>;
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
  /** The get_railway_service_status tool nests the service name here. */
  service?: { name?: string };
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
