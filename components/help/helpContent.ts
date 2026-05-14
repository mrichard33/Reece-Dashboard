/**
 * Central registry of all info popover content. Keyed `pageName.tileName`.
 *
 * Every Phase 1 tile/section has an entry here. The InfoPopover component
 * looks up the key and renders the { what, where, fix } triple. New tiles
 * MUST add an entry before shipping — no inline help strings in JSX.
 */

export type HelpEntry = {
  /** Short heading shown at the top of the popover. */
  title: string;
  /** What this number / list / chart represents. */
  what: string;
  /** Where the data comes from — table, MCP tool, or query. */
  where: string;
  /** What action to take if it looks wrong. Concrete and specific. */
  fix: string;
};

export const helpContent: Record<string, HelpEntry> = {
  // ── /overview · Row 1: service health ──────────────────────────────────
  "overview.lpMcp": {
    title: "LP MCP",
    what: "Status of the Lead Perfection MCP service on Railway. Healthy means the service is running and has deployed within the last 24 hours.",
    where:
      "Live call to `LP MCP get_railway_service_status` on every overview render (cached 60s).",
    fix: "If red, open the Railway dashboard for the LP MCP service and check logs. If yellow, last deploy is stale (>24h) — may be intentional, but worth verifying.",
  },
  "overview.hlMcp": {
    title: "HL MCP",
    what: "Status of the HL Workflow Intelligence MCP service. Same health rules as LP MCP.",
    where:
      "Live call to `HL MCP get_railway_service_status` on every overview render (cached 60s).",
    fix: "If red, open the Railway dashboard for the HL MCP and check logs. The HL MCP backs every workflow/diagnostics page — when it's down, those pages will degrade.",
  },
  "overview.heartbeat": {
    title: "Decision Engine Heartbeat",
    what: "The Decision Engine runs every 5 minutes via an n8n workflow. Each tick processes pending events, evaluates rules, and queues actions. Green if the most recent tick is under 6 minutes old.",
    where:
      "Latest row in `agent_events` where `event_type = 'heartbeat.tick'` (LP Supabase).",
    fix: "If yellow or red, automations are not firing. Check the n8n workflow at `ERnvX5hp6i90VVWc`. If it's stopped, restart it. If it's running but no ticks are arriving, check LP MCP Railway logs.",
  },
  "overview.syncHealth": {
    title: "Supabase Sync",
    what: "How recently both Supabase caches synced from GHL and LP. Green under 30 min, yellow under 2 h, red beyond that.",
    where:
      "Live calls to `LP MCP get_sync_health` and `HL MCP get_sync_health` (cached 60s). Worst of the two drives the tile.",
    fix: "Click the tile to trigger a manual sync. If sync fails repeatedly, check Railway logs for whichever MCP is stale — the error will be in the most recent failed sync event.",
  },

  // ── /overview · Row 2: headline stats ──────────────────────────────────
  "overview.leadsToday": {
    title: "Leads Today",
    what: "Count of new LP leads created since midnight (America/New_York). Includes every source.",
    where: "`select count(*) from lp_leads where created_at::date = current_date` (LP Supabase).",
    fix: "If unexpectedly low, check `/leads` source distribution — a specific source may have stopped delivering. Confirm sync is fresh first.",
  },
  "overview.appointmentsToday": {
    title: "Appointments Today",
    what: "Count of opportunities currently in an appointment stage with a scheduled date of today.",
    where:
      "`opportunities` joined to `stages` (HL Supabase), filtered to appointment stages and today's appointment date custom field.",
    fix: "If too low and recent leads exist, check whether they were enrolled into the booking workflow. If too high vs. calendar, check for duplicate opp creation.",
  },
  "overview.oppsInFlight": {
    title: "Opps in Flight",
    what: "Total open P1 opportunities across all stages. Excludes won/lost/abandoned.",
    where:
      "`select count(*) from opportunities where pipeline_id = <P1> and status = 'open'` (HL Supabase).",
    fix: "If this drops sharply, check `/pipelines` for an unexpected mass-close. If it climbs without close-out, check stage aging on `/pipelines`.",
  },
  "overview.pendingApprovals": {
    title: "Pending Approvals",
    what: "Agent actions waiting on human approval via GroupMe. High-stakes actions (opportunity moves, contact deletions, mass tag changes) require this.",
    where:
      "`select count(*) from groupme_approval_requests where status = 'pending'` (LP Supabase).",
    fix: "Open `/agent/approvals` (Phase 2) to review and approve/reject. While waiting, the queued action does not execute.",
  },
  "overview.openIssues": {
    title: "Open Issues",
    what: "Issues Claude has logged but not yet resolved. These span data drift, automation breakage, and architectural concerns.",
    where:
      "`select count(*) from claude_known_issues where resolved_at is null` (LP Supabase).",
    fix: "Open `/issues` to triage. Issues are added during sessions and should be resolved (resolved_at set) once fixed.",
  },

  // ── /overview · Row 3: activity + alerts ───────────────────────────────
  "overview.activity": {
    title: "Recent Activity",
    what: "Last 20 system events across LP and HL. Color-coded by priority (low/normal/high/critical).",
    where: "`select … from system_events order by created_at desc limit 20` (LP Supabase).",
    fix: "If the feed is empty or stale, the event bus isn't firing. Check `/ops/events` (Phase 3) for the raw feed, or run the LP MCP heartbeat manually.",
  },
  "overview.alerts": {
    title: "Active Alerts",
    what: "Open issues sorted by severity. Anything here is something Claude or the system has flagged for attention.",
    where: "`claude_known_issues` where `resolved_at is null`, ordered by severity (LP Supabase).",
    fix: "Click an alert to open `/issues`. Resolve by setting `resolved_at = now()` on the row once addressed.",
  },

  // ── /pipelines ────────────────────────────────────────────────────────
  "pipelines.stageBars": {
    title: "Stage Aging",
    what: "How long opportunities have been sitting in each stage on average. Green = healthy flow (<7d). Yellow = some attention (7–14d). Red = systemic stall (>14d).",
    where:
      "`opportunities` grouped by `pipeline_stage_id`, with `avg(now() - updated_at)` per stage (HL Supabase).",
    fix: "Click a stage to see the underlying opps (Phase 2). Long aging usually means a workflow broke, a rep is sitting on deals, or the stage exit criteria isn't being met.",
  },
  "pipelines.total": {
    title: "Pipeline Total",
    what: "Open opportunity count and combined monetary value for this pipeline. Excludes won/lost/abandoned.",
    where: "`opportunities` filtered to this pipeline_id with `status = 'open'`.",
    fix: "If the total value seems off, check whether monetary_value is being set on opp creation. Some sources don't populate it until a later stage.",
  },

  // ── /workflows ────────────────────────────────────────────────────────
  "workflows.total": {
    title: "Total Workflows",
    what: "Every non-deleted workflow in GHL, including drafts. The canonical_code column comes from the workflow_registry table.",
    where: "`workflows` joined to `workflow_registry` (HL Supabase). Filter `deleted_at is null`.",
    fix: "If a workflow is missing, trigger a sync. If a workflow has no canonical code, it hasn't been registered yet — add a row to workflow_registry.",
  },
  "workflows.lastExecution": {
    title: "Last Execution",
    what: "Most recent execution timestamp for this workflow. Currently always shows '—' because the workflow_executions table is unpopulated (known issue).",
    where:
      "Intended source is `workflow_executions` (HL Supabase), but the HL MCP webhook handler isn't writing to it.",
    fix: "This is a known cache gap, tracked in `claude_known_issues`. Don't try to fix from this dashboard — observability only. Use GHL's own execution history in the meantime.",
  },
  "workflows.healthFlags": {
    title: "Health Flags",
    what: "Diagnostic badges flagging workflows with known structural issues: dead (triggers reference missing resources), duplicate trigger, wait bottleneck, or message overlap with another workflow.",
    where:
      "Aggregated from `HL MCP detect_dead_workflows`, `find_duplicate_triggers`, `detect_wait_bottlenecks`, and `detect_message_overlap` (cached 5min).",
    fix: "Click a flagged workflow to open its detail page (Phase 2). For systematic remediation, use `/workflows/diagnostics` (Phase 2).",
  },

  // ── /issues ───────────────────────────────────────────────────────────
  "issues.openIssues": {
    title: "Open Issues",
    what: "Every unresolved issue Claude or the team has logged. Severity ordered. Includes data drift, automation breakage, architectural concerns.",
    where: "`claude_known_issues` where `resolved_at is null` (LP Supabase).",
    fix: "Click an issue to see detail (Phase 2). Resolve by setting `resolved_at = now()` on the row.",
  },
  "issues.contamination": {
    title: "Contamination Violations",
    what: "Workflows whose copy levers conflict with their assigned stage / lever / pressure level. Indicates a workflow is firing the wrong kind of message for its position in the funnel.",
    where: "Live call to `HL MCP check_contamination` (cached 5min).",
    fix: "Open the listed workflow in GHL and either re-classify it in `workflow_registry` or revise the message content to match the assigned levers.",
  },
  "issues.namespace": {
    title: "Namespace Violations",
    what: "Contacts holding two or more tags inside an exclusive namespace (e.g. two `active-entry:*` tags, two `stage:*` tags). Namespace exclusivity is a core invariant — a contact should never be in two stages.",
    where: "Live call to `HL MCP audit_namespace_violations` (cached 5min).",
    fix: "Open the contact in GHL and remove the older tag. The active-entry conflict almost always indicates a workflow re-tagging without first stripping the prior tag.",
  },
  "issues.drift": {
    title: "Drift Candidates",
    what: "Contacts closed/won in GHL but still showing active in LP. Indicates the LP→HL or HL→LP sync didn't propagate a status update.",
    where: "Live call to `LP MCP get_drift_candidates` (cached 5min).",
    fix: "If a small number, update the LP record manually. If systematic, check the cross-sync workflow — it's likely failing silently.",
  },
  "issues.stuck": {
    title: "Stuck Contacts",
    what: "Open opportunities whose stage hasn't changed in 14+ days. Indicates either a broken workflow, a rep sitting on deals, or a missing exit criterion.",
    where:
      "`opportunities` where `status = 'open'` and `updated_at < now() - interval '14 days'` (HL Supabase).",
    fix: "Click into each opp to investigate (Phase 2). If the rep is dormant, route via the manager workflow. If the workflow expected to advance them is broken, that's a separate fix.",
  },

  // ── shell · global ────────────────────────────────────────────────────
  "shell.syncNow": {
    title: "Sync Now",
    what: "Manually triggers a sync from GHL and LP into their respective Supabase caches. Use when a freshness banner is yellow/red, or when you've just made a change in GHL and want it reflected here.",
    where: "Calls `LP MCP sync_all_entities` and `HL MCP sync_all_entities` in parallel.",
    fix: "If the button is greyed out, an existing sync job is in progress. If it returns an error, the underlying MCP is down — check service health on `/overview`.",
  },
  "shell.staleSync": {
    title: "Stale Sync Warning",
    what: "The HL or LP cache hasn't synced in over 2 hours. Data on every page may be out of date.",
    where: "Computed from `get_sync_health` calls on each render.",
    fix: "Click 'Sync now' in the topbar. If that fails, the relevant MCP is down — check `/overview` Row 1.",
  },
};

export function getHelp(key: string): HelpEntry | null {
  return helpContent[key] ?? null;
}
