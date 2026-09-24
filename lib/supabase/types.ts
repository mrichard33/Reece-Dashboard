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
 * A row of `v_job_status` (LP-MCP sql/113_job_runs.sql): the background-job
 * roster joined to its latest run and a 24h tally. A registered job that has
 * never run appears with every `last_*` field null — that row is the point.
 */
export type JobStatusRow = {
  job_id: string;
  label: string;
  job_group: string;
  cadence: string | null;
  enabled_env: string | null;
  enabled_default: boolean;
  /** The gate resolved on the LP MCP service at boot. The dashboard cannot read those env vars. */
  enabled: boolean;
  last_status: "running" | "ok" | "failed" | "unknown" | "skipped" | "interrupted" | string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_elapsed_ms: number | null;
  last_summary: string | null;
  last_instance_id: string | null;
  runs_24h: number;
  ok_24h: number;
  failed_24h: number;
  unknown_24h: number;
  interrupted_24h: number;
};

/** Projection of `agent_rules` read by /agent. Rules are database config, never written from here. */
export type AgentRule = {
  id: number;
  rule_key: string;
  rule_name: string;
  category: string | null;
  enabled: boolean;
  priority: number | null;
  requires_approval: boolean | null;
  updated_at: string | null;
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
// Per-lead feeds (lp_call_logs / lp_notes / lp_activities)
// ─────────────────────────────────────────────────────────────────
//
// Every column EXCEPT the `raw_lp_data` jsonb blob, which lives in TOAST,
// is never rendered, and would be fetched on every row by `select('*')`.
// Projecting these columns is fix #4 of the LP read-I/O work.

export type LpCallLog = {
  id: string;
  lp_call_id: string;
  lp_lead_id: string | null;
  ghl_contact_id: string | null;
  call_date: string | null;
  call_duration_sec: number | null;
  call_result: string | null;
  call_direction: string | null;
  rep_id: string | null;
  rep_name: string | null;
  call_notes: string | null;
  recording_url: string | null;
  synced_at: string | null;
  agent_id: string | null;
  agent_name: string | null;
};

export type LpNote = {
  id: string;
  lp_note_id: string;
  lp_lead_id: string | null;
  ghl_contact_id: string | null;
  note_body: string | null;
  note_type: string | null;
  created_by_rep_id: string | null;
  created_by_rep_name: string | null;
  created_at_lp: string | null;
  synced_at: string | null;
  note_category: string | null;
  ghl_note_pushed: boolean | null;
};

export type LpActivity = {
  id: string;
  lp_activity_id: string;
  lp_lead_id: string | null;
  activity_type: string | null;
  activity_detail: string | null;
  rep_id: string | null;
  rep_name: string | null;
  activity_date: string | null;
  synced_at: string | null;
};

/**
 * Keyset (cursor) pagination primitives. The cursor is the last row's
 * `(sort_timestamp, id)`; `lastDate` is always a UTC `Z` ISO string so it is
 * safe to embed in a supabase-js `.or()` filter (which is NOT url-encoded — a
 * `+00:00` offset would otherwise have its `+` decoded to a space). See
 * lib/queries/leads.ts.
 */
export type Cursor = { lastDate: string; lastId: string } | null;

/** One page of a feed plus the cursor for the next page (null = no more). */
export type FeedPage<T> = { rows: T[]; nextCursor: Cursor };

// ─────────────────────────────────────────────────────────────────
// Executive Review & Showcase (LP Supabase — see db/migrations/0002)
// ─────────────────────────────────────────────────────────────────

export type Executive = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  is_admin: boolean;
  /** DB-managed approver flag (db/migrations/0007). Authoritative over APPROVER_EMAILS. */
  is_approver: boolean;
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

export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  color?: string | null;
};

export type Pipeline = {
  id: string;
  ghl_pipeline_id: string;
  ghl_location_id: string | null;
  name: string;
  stages: PipelineStage[] | null;
  deleted_at: string | null;
};

export type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
};

export type Opportunity = {
  id: string;
  ghl_opportunity_id: string;
  ghl_pipeline_id: string;
  ghl_stage_id: string | null;
  ghl_contact_id: string | null;
  name: string;
  status: "open" | "won" | "lost" | "abandoned" | null;
  monetary_value: number | null;
  currency: string | null;
  source: string | null;
  /** GHL-native created instant — use for cycle aging, NOT created_at. */
  date_added: string | null;
  /** GHL-native last-change instant — use for idle/stuck, NOT updated_at. */
  date_updated: string | null;
  synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
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
  /** HL has no last_modified_at; updated_at is the cache's last change. */
  updated_at: string | null;
  deleted_at: string | null;
};

export type WorkflowRegistry = {
  canonical_code: string;
  workflow_id: string;
  canonical_name: string | null;
  legacy_name: string | null;
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

/**
 * LP MCP `get_contact_timeline` (verified live 2026-09-24 on
 * gkJmc5DPc3nHXoevNH5K). `detail` on call rows carries a `raw` copy of the LP
 * row — the journey normalizer strips it before anything reaches the browser.
 */
export type LpTimelineRaw = {
  resolved: { ghl_contact_id: string | null; lp_lead_ids: string[] };
  window?: { since_days: number; earliest: string | null; latest: string | null };
  timeline: Array<{
    ts: string;
    source: "lp" | "agentic" | string;
    type: string;
    summary: string;
    detail?: Record<string, unknown>;
  }>;
  counts: Record<string, number>;
  event_count: number;
};

/** LP MCP `search_leads` — a name/phone/email/address `ilike`. No id match. */
export type LpSearchLeadsRaw = {
  search_term: string;
  total: number;
  results: Array<{
    lp_lead_id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    disposition_label: string | null;
    rep_name: string | null;
  }>;
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

// ─────────────────────────────────────────────────────────────────
// Facebook Content Engine (LP Supabase — see db/migrations/0003, 0004, 0011)
// ─────────────────────────────────────────────────────────────────

export type FbPillar =
  | "storm"
  | "noise"
  | "energy"
  | "security"
  | "comfort"
  | "insurance"
  | "uv"
  | "value";

export type FbArchetype =
  | "myth-bust"
  | "secret-reveal"
  | "story"
  | "mistake-expose"
  | "seasonal"
  | "thought-leadership"
  | "community-cause"
  | "social-proof";

export type FbTarget = "group" | "page" | "both";
export type FbComponentStatus = "pending" | "approved" | "rejected";
export type FbPostStatus = "draft" | "approved" | "posted" | "skipped";
export type FbSubtopicStatus = "proposed" | "active" | "inactive" | "rejected";
export type FbPlanStatus = "planned" | "generated" | "skipped";
/**
 * Post media type (0011, text added in 0014). Video posts gate on copy + video;
 * image posts on copy + image; text posts (no image at all) gate on copy alone.
 */
export type FbMediaType = "image" | "video" | "text";
export type FbComponent = "copy" | "image" | "both" | "video";

/**
 * Rejection reason codes. Component-specific sets live in
 * components/content/meta.ts (COPY_REASON_CODES / IMAGE_REASON_CODES /
 * VIDEO_REASON_CODES); this union matches the fb_post_feedback CHECK
 * constraint as widened in db/migrations/0011.
 */
export type FbReasonCode =
  // copy
  | "weak-hook"
  | "off-brand"
  | "inaccurate"
  | "canon-violation"
  | "compliance-risk"
  | "too-salesy"
  | "wrong-pillar-fit"
  | "weak-cta"
  // image
  | "image-mismatch"
  | "wrong-scene"
  | "looks-ai"
  | "wrong-mood"
  | "bad-composition"
  | "image-artifacts"
  | "image-quality"
  // video
  | "motion-unnatural"
  | "video-quality"
  // shared
  | "other";

export type FbPost = {
  id: string;
  scheduled_date: string;
  target: FbTarget;
  pillar: string | null;
  archetype: string | null;
  post_body: string | null;
  first_comment: string | null;
  image_concept: string | null;
  image_url: string | null;
  subtopic_id: string | null;
  copy_status: FbComponentStatus;
  image_status: FbComponentStatus;
  status: FbPostStatus;
  revision: number;
  needs_manual: boolean;
  approved_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  fb_permalink: string | null;
  created_at: string;
  // ── Page auto-publish (WF4) state — added in 0006_fb_publish.sql ──
  page_posted_at: string | null;
  page_permalink: string | null;
  publish_attempts: number;
  last_publish_error: string | null;
  // Time-of-day controller: scheduled_time is the chosen Eastern wall-clock time
  // ("HH:MM[:SS]"); null = publish on approval. publish_at is the derived UTC instant
  // (set by the fb_set_publish_at trigger) WF4 gates on.
  scheduled_time: string | null;
  publish_at: string | null;
  // ── Video component (0011). media_type drives which components gate approval.
  // video_status is null until a video is generated (generation still deferred). ──
  media_type: FbMediaType;
  video_concept: string | null;
  video_url: string | null;
  video_status: FbComponentStatus | null;
};

/**
 * Single-row FB content-engine config (id = 1). Non-secret connection fields
 * (0006_fb_publish) plus UI-managed generation tuning (0007_settings_controls)
 * and the video mix knobs (0011). The token itself lives in fb_secrets
 * (service-role only), never here.
 * Tuning/knob columns are nullable: null = fall back to the env knob, then a
 * hardcoded default.
 */
export type FbSettings = {
  id: number;
  fb_page_id: string | null;
  fb_graph_version: string;
  auto_publish_enabled: boolean;
  fb_page_name: string | null;
  token_last4: string | null;
  token_updated_at: string | null;
  updated_by: string | null;
  updated_at: string;
  // ── Generation tuning (0007) — null = use env fallback / default ──
  default_post_time: string | null; // "HH:MM[:SS]" Eastern; null = publish on approval
  max_regen_attempts: number | null;
  max_per_generation: number | null;
  plan_horizon_days: number | null;
  generation_buffer_days: number | null;
  // ── Video mix knobs (0011) — null = use env fallback / default ──
  video_share: number | null; // % of posts that should be video (0-100)
  mascot_frequency: number | null; // % of video posts that use the mascot (0-100)
  text_share: number | null; // % of auto-generated posts that ship text-only (0-100, 0014)
  animate_still_model: string | null; // fal animate-still model id (video-gen; UI deferred)
};

export type FbSubtopic = {
  id: string;
  subtopic: string;
  pillar: string;
  buyer_stage: string | null;
  source: string;
  answers_question: string | null;
  source_evidence: string | null;
  status: FbSubtopicStatus;
  last_used_at: string | null;
  times_used: number;
  created_at: string;
};

/** Brief statuses on fb_content_plan (0011). 'none' = no strategist brief yet. */
export type FbBriefStatus = "none" | "draft" | "approved";

/**
 * The Strategist's Content Brief — the 12-field JSON the `strategist` prompt
 * emits, stored on fb_content_plan.brief. All optional (a partial/legacy brief
 * should still render).
 */
export type FbContentBrief = {
  post_strategy?: string;
  caption_direction?: string;
  image_concept?: string;
  video_concept?: string;
  recommended_format?: string;
  recommended_platform?: string;
  recommended_cta?: string;
  why_it_works?: string;
  data_insight_trigger?: string;
  funnel_stage?: string;
  pillar?: string;
  buyer_objective?: string;
};

export type FbContentPlan = {
  id: string;
  plan_date: string;
  pillar: string;
  archetype: string;
  subtopic_id: string | null;
  campaign: string | null;
  status: FbPlanStatus;
  created_at: string;
  // ── Content-Brief storage (0011) — the Strategist output lands here ──
  brief: FbContentBrief | null;
  brief_status: FbBriefStatus;
};

export type FbMessagingPrompt = {
  id: string;
  name: string;
  body: string;
  version: number;
  is_active: boolean;
  created_at: string;
};

export type FbMessageBank = {
  id: string;
  variables: Record<string, unknown>;
  version: number;
  segment: string | null;
  is_active: boolean;
  created_at: string;
};

export type FbPostFeedback = {
  id: string;
  post_id: string;
  component: FbComponent;
  reason_code: FbReasonCode;
  reason_text: string | null;
  rejected_snapshot: string | null;
  rejected_by: string;
  created_at: string;
};

export type FbPostMetric = {
  id: string;
  post_id: string;
  source: "page" | "group";
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
  reach: number | null;
  link_clicks: number | null;
  pulled_at: string;
};

/** Row of v_fb_post_engagement: a post joined to its latest metrics + rate. */
export type FbPostEngagement = {
  id: string;
  scheduled_date: string;
  pillar: string | null;
  archetype: string | null;
  target: FbTarget;
  status: FbPostStatus;
  post_body: string | null;
  posted_at: string | null;
  metric_source: "page" | "group" | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
  reach: number | null;
  link_clicks: number | null;
  pulled_at: string | null;
  engagement_rate: number | null;
};
