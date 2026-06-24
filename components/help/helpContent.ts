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
  // ── /overview · Row 1: service health ───────────────────────────────
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

  // ── /overview · Row 2: headline stats ───────────────────────────────
  "overview.leadsToday": {
    title: "Leads Today",
    what: "Count of new LP leads created since midnight (America/New_York). Includes every source.",
    where: "`select count(*) from lp_leads where created_at::date = current_date` (LP Supabase).",
    fix: "If unexpectedly low, check `/leads` source distribution — a specific source may have stopped delivering. Confirm sync is fresh first.",
  },
  "overview.appointmentsToday": {
    title: "Appointments Today",
    what: "Count of real appointments scheduled for today (America/New_York), from the synced HL `appointments` calendar. Excludes soft-deleted/cancelled rows.",
    where:
      "`select count(*) from appointments where deleted_at is null and start_time >= <ET-midnight> and start_time < <ET-midnight+1d>` (HL Supabase).",
    fix: "If too low and recent leads exist, check whether they were enrolled into the booking workflow and whether the appointments sync is fresh. If too high vs. the calendar, check for duplicate appointment creation.",
  },
  "overview.oppsInFlight": {
    title: "Opps in Flight (30d)",
    what: "Open opportunities that are genuinely active — open, not deleted, and updated in GHL within the last 30 days. Excludes won/lost/abandoned and long-dormant opps.",
    where:
      "`select count(*) from opportunities where status = 'open' and deleted_at is null and date_updated >= now() - interval '30 days'` (HL Supabase). Uses `date_updated` (real GHL time), not the sync-time `updated_at`.",
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

  // ── /overview · Row 3: activity + alerts ─────────────────────────────
  "overview.activity": {
    title: "Recent Activity",
    what: "Last 20 system events. Contact-linked events (new lead, appointment, status change …) show as cards with the contact name, prospect #, LP source and subsource; system events (heartbeat, sync) appear compact below. Click any entry for full details.",
    where:
      "`system_events` (LP Supabase) joined in code to `lp_leads` on `lp_lead_id` for the contact name / prospect # / source / subsource.",
    fix: "If the feed is empty or stale, the event bus isn't firing. Check the Decision Engine heartbeat tile, or run the LP MCP heartbeat manually.",
  },
  "overview.alerts": {
    title: "Active Alerts",
    what: "Open issues, most recent first, written in plain language with a severity label. Click an alert for what happened, who's affected, how important it is, and the recommended next steps.",
    where:
      "`claude_known_issues` where `status = 'open'` (LP Supabase). Plain-language titles and actions are mapped from the issue category.",
    fix: "Use “View details” for recommended actions, or open `/issues` to triage. Resolve by setting `resolved_date` and `status = 'closed'` on the row once addressed.",
  },

  // ── /pipelines ─────────────────────────────────────────────
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
  "pipelines.dataLineage": {
    title: "Opp data lineage",
    what: "Each opp row shows the contact's display name and their LP prospect ID. The display name is derived from the HL `contacts` cache; the LP prospect ID is read from the GHL custom field `ZRQAVrzhtzApzLlHmT87` stored on that contact.",
    where:
      "HL Supabase `opportunities` joined in code to HL Supabase `contacts` (no SQL join because they live in the same instance but are queried in parallel and merged). LP prospect ID comes from `custom_fields` JSONB on the HL contact — first object with id = `ZRQAVrzhtzApzLlHmT87`.",
    fix: "If a row shows `—` for LP prospect ID, the GHL contact is missing the custom field. Set it in GHL and trigger a sync. If a whole pipeline shows `(name unavailable)`, the HL contacts cache failed to load — check Railway logs for the dashboard and the HL Supabase schema for the `contacts` table.",
  },

  // ── /workflows ─────────────────────────────────────────────
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

  // ── /issues ─────────────────────────────────────────────────
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

  // ── shell · global ───────────────────────────────────────────────
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

  // ── /overview · Paid Media (Lead Gurus) ──────────────────────────
  "paidMedia.section": {
    title: "Paid Media (Lead Gurus)",
    what: "FB ad performance from Lead Gurus (the paid-media agency, client id 91): spend, leads, self-books, demos, and attributed gross/net revenue for the most recent pulled day, plus a 30-day trend and a per-territory breakdown.",
    where:
      "`ft_daily_summary` + `ft_summary_territory` (LP Supabase), fed daily ~06:00 ET by the n8n workflow 'I.LG — Lead Gurus Daily Pull' → LP-MCP `/n8n/leadgurus/daily-pull`.",
    fix: "If empty or stale, check the I.LG workflow's last execution in n8n and confirm `LEAD_GURUS_API_KEY` is set on LP-MCP. Backfill history via `POST /n8n/leadgurus/backfill`.",
  },
  "paidMedia.spend": {
    title: "Ad Spend",
    what: "Total Lead Gurus ad spend for the most recent pulled day.",
    where: "`ft_daily_summary.total_spend` for the latest date.",
    fix: "If $0 with leads present, Lead Gurus may not have reported spend yet for the day — verify on their platform.",
  },
  "paidMedia.leads": {
    title: "Leads",
    what: "Leads delivered by Lead Gurus for the most recent pulled day.",
    where: "`ft_daily_summary.total_leads` for the latest date.",
    fix: "Cross-check against `ft_leads` row count for the same date if the number looks off.",
  },
  "paidMedia.cpl": {
    title: "Cost Per Lead",
    what: "Spend divided by leads for the most recent pulled day, as reported by Lead Gurus.",
    where: "`ft_daily_summary.cost_per_lead` for the latest date.",
    fix: "If blank, either spend or leads is missing for the day — see the Spend and Leads tiles.",
  },
  "paidMedia.selfBooks": {
    title: "Self-Books",
    what: "Leads who self-booked an appointment for the most recent pulled day.",
    where: "`ft_daily_summary.self_book_count` for the latest date.",
    fix: "Self-book detail per lead lives in `ft_leads.self_book_appointment_datetime`.",
  },
  "paidMedia.costPerSelfBook": {
    title: "Cost / Self-Book",
    what: "Spend divided by self-booked appointments for the most recent pulled day.",
    where: "`ft_daily_summary.cost_per_self_book` for the latest date.",
    fix: "If blank, no self-books were recorded for the day.",
  },
  "paidMedia.demos": {
    title: "Demos",
    what: "Demos attributed to Lead Gurus for the most recent pulled day.",
    where: "`ft_daily_summary.demos` for the latest date.",
    fix: "Demo/sale attribution is fed by Lead Gurus' summary feed — confirm with them how closed-deal data flows in.",
  },
  "paidMedia.grossRevenue": {
    title: "Gross Revenue",
    what: "Gross revenue attributed to Lead Gurus for the most recent pulled day.",
    where: "`ft_daily_summary.gross_amount` for the latest date.",
    fix: "Revenue is reported by Lead Gurus' daily summary. Confirm their closed-deal feed before treating as authoritative.",
  },
  "paidMedia.netRevenue": {
    title: "Net Revenue",
    what: "Net revenue attributed to Lead Gurus for the most recent pulled day.",
    where: "`ft_daily_summary.net_amount` for the latest date.",
    fix: "Same source as Gross Revenue — `ft_daily_summary`.",
  },
  "paidMedia.trend": {
    title: "Spend vs Revenue (30d)",
    what: "Daily ad spend versus attributed gross revenue over the last 30 pulled days.",
    where: "`ft_daily_summary.total_spend` and `gross_amount`, ordered by date.",
    fix: "Gaps in the line mean a day wasn't pulled — run a backfill for the missing window.",
  },
  "paidMedia.territory": {
    title: "Territory Breakdown",
    what: "Per-territory spend, leads, CPL, self-books, demos, and gross revenue for the most recent pulled day.",
    where: "`ft_summary_territory` for the latest date, ordered by spend.",
    fix: "Territories come straight from Lead Gurus' `/summary/territory/` feed.",
  },
  // ── /scorecard · Goal/variance ("Monday a.m.") report ────────────────
  "scorecard.funnel": {
    title: "MTD funnel vs goal",
    what: "Month-to-date ACTUALS (Leads/Issued, Sales, Demos, Good Business $) re-derived from raw Lead Perfection records, shown against the Monthly Goal and a prorated MTD Goal. Actual cells are green when they meet/beat the MTD goal, red when behind. Rows marked ⚠ (Close %, Good Rate, Good Business $, KO %) use provisional LP-internal definitions pending tie-out.",
    where:
      "`lp_market_scorecard_daily` (latest snapshot, written daily by the LP-MCP job from the live LP API — NOT the lp_leads cache) joined at read time to the editable `scorecard_goals`. Goal columns / pace / variance are computed in `lib/queries/scorecard.ts`.",
    fix: "If a number looks wrong, run the backfill for a closed window (`POST /n8n/admin/goal-scorecard-run`) and reconcile to the Reece Monday-a.m. export. Edit the goal targets via the admin Goals editor on this page. The PROVISIONAL banner clears once a market is reconciled.",
  },
  "scorecard.header": {
    title: "Goal & pace header",
    what: "Selling days, days elapsed, prorated goal-to-date, average sale, NSLI, gross/pending dollars and per-day pace. Everything is on a SELLING-DAY basis (Mon–Sat minus Reece closures). MTD Goal = monthly goal × (selling days elapsed ÷ selling days in the month). Pace targets derive from the monthly goal $ ÷ trailing NSLI ÷ selling days (provisional).",
    where: "Derived in `lib/queries/scorecard.ts` from `lp_market_scorecard_daily` actuals (`days_elapsed`, `working_days_in_period`, both selling days written by the LP-MCP job) + `scorecard_goals`. The job uses `src/selling-days.js`; the calendar is configured by `SCORECARD_SELLING_DAYS` / `SCORECARD_HOLIDAYS`.",
    fix: "Set `trailing_nsli` and `monthly_goal_dollars` in the Goals editor to drive accurate pace. To change which days count, edit the `SCORECARD_SELLING_DAYS` / `SCORECARD_HOLIDAYS` env on the LP-MCP service. The Goals editor `working_days` is only a fallback for snapshots written before the selling-day fix.",
  },
  "scorecard.pace": {
    title: "Per-day pace",
    what: "Target vs actual leads issued, demoed, and closed per SELLING day. Actuals = count ÷ selling days elapsed. ⚠ The target derivation is provisional until reconciled to a Reece export.",
    where: "Computed at read time from goals (trailing NSLI, selling days, funnel %) and actuals ÷ selling days elapsed (`days_elapsed`).",
    fix: "If targets look off, confirm `trailing_nsli` and the target percentages in the Goals editor; if the day counts look off, check `SCORECARD_SELLING_DAYS` / `SCORECARD_HOLIDAYS`.",
  },
  "scorecard.daysElapsed": {
    title: "Selling days & Days Elapsed",
    what: "The scorecard counts SELLING days, not calendar days. By default Mon–Sat are selling days and Sunday is not; the Reece closure list (New Year's, Independence Day, Thanksgiving, Christmas) is also excluded. Juneteenth is intentionally a selling day. 'Days Elapsed' is selling days from the 1st through the as-of date; 'Selling Days' is selling days in the full month (e.g. June 2026 = 26). The snapshot is reported 'complete through' the last COMPLETED selling day — yesterday if it was a selling day, otherwise the most recent one (so on Sun/Mon the period ends the prior Saturday). Today's partial numbers never feed goal/pace math.",
    where: "Written by the LP-MCP job `goal-scorecard-daily.js` via `src/selling-days.js` into `days_elapsed` / `working_days_in_period`; mirrored read-side in `lib/date/sellingDays.ts` for the stale-snapshot guard.",
    fix: "If the count is wrong for a month, verify `SCORECARD_SELLING_DAYS` (weekday pattern) and `SCORECARD_HOLIDAYS` (closure dates, or `none`) on the LP-MCP service, then re-run the backfill (`POST /n8n/admin/goal-scorecard-run`). If 'snapshot stale' shows, the daily job hasn't advanced — check `/n8n/admin/goal-scorecard-status`.",
  },
  "scorecard.variance": {
    title: "Won/Lost vs goal",
    what: "Dollarized and point-gap variance of actuals against goal. ⚠ The bridge math is provisional (LP-internal) until reconciled to a Reece export.",
    where: "Computed in `lib/queries/scorecard.ts` (net sales vs MTD goal $, plus per-metric point gaps).",
    fix: "Treat as directional until the PROVISIONAL banner clears.",
  },
  "scorecard.sources": {
    title: "Source Performance",
    what: "Per-source funnel for the latest snapshot, By Appt Date — leads, issued, demo%, close%, Net Sales (released $), pending, and NSLI, with the same released/working/cancel definitions as the aggregate. 'Quality' flags a source's close% vs the REECE average: Strong (≥ average), OK (≥ half), Weak (< half). Sortable; default sort is Net Sales. Sources that don't resolve through lp_source_mapping are marked ⚠ and counted in the header badge.",
    where:
      "`lp_source_scorecard_daily` (latest snapshot), written daily by the LP-MCP job in the same run as the aggregate row via `computeActuals(..., { groupBy:['source','sub_source'] })`. Read by `lib/queries/sources.ts`.",
    fix: "If a source is ⚠ unmapped, add it to `lp_source_mapping` (ties to lp_unmapped_sources). Per-source numbers inherit the aggregate's PROVISIONAL status until reconciled. Backfill a window via `POST /n8n/admin/goal-scorecard-run`.",
  },
  "scorecard.leadcost": {
    title: "Lead Cost",
    what: "Per-source spend efficiency over the snapshot window: spend, cost per lead, cost as % of Net Sales (released $), and ROMI (Net Sales ÷ spend). Cost % is green at/under the target, amber up to ~1.3× target, red above. Sources with no spend show 'Spend not connected' instead of a misleading 0% — spend is never invented.",
    where:
      "`lib/queries/leadcost.ts` joins `lp_source_scorecard_daily` (collapsed to source) to `lp_source_spend_daily` over the MTD window, plus the existing LeadGurus feed (`ft_daily_summary`) attributed to the 'Lead Gurus' source. Target % is `SCORECARD_LEADCOST_TARGET_PCT` (default 15).",
    fix: "To light up a source, land daily spend in `lp_source_spend_daily` (market, source, sub_source, spend_date, spend). The Lead Gurus row fills automatically from the LeadGurus daily pull. Adjust the target via `SCORECARD_LEADCOST_TARGET_PCT` on the dashboard service.",
  },

  // ── /scorecard · per-KPI + Phase 4 UX ────────────────────────────────
  "scorecard.kpi.netsales": {
    title: "Net Sales (Released)",
    what: "Sold dollars on deals RELEASED to production — the bookable, finalized revenue. Excludes cancelled deals and deals still held (those are Working Revenue). This is the headline goal metric.",
    where: "`lp_market_scorecard_daily.released_dollars` (= net_sales). Bucketed by LP-MCP `computeActuals` from job statuses in `SCORECARD_RELEASED_STATUSES`.",
    fix: "If it looks low vs the old number, that's expected post-Phase-1: held deals moved to Working Revenue. Reconcile the released/working status sets against the Reece export.",
  },
  "scorecard.kpi.working": {
    title: "Working Revenue",
    what: "Sold but HELD dollars — financing/HOA/docs/measure not yet released to production. Earned but not bookable, and a pipeline risk if it stalls. Counts toward Net Close (not cancelled) but NOT toward Net Sales.",
    where: "`lp_market_scorecard_daily.working_dollars`. Statuses in `SCORECARD_WORKING_STATUSES`.",
    fix: "If a status is misclassified, adjust `SCORECARD_WORKING_STATUSES` (env, no code change) and re-run the scorecard. Cross-check against the status tally in the Tie-out panel.",
  },
  "scorecard.kpi.pending": {
    title: "Pending Total",
    what: "Working Revenue plus any other non-cancelled, not-yet-released sold dollars. The full in-flight balance behind Net Sales.",
    where: "`lp_market_scorecard_daily.pending_total` (= working_dollars + other_pending).",
    fix: "Audit what landed in 'other pending' via the Tie-out panel's status tally — some statuses may belong in the Working set.",
  },
  "scorecard.kpi.demos": {
    title: "Demos",
    what: "Sat appointments that count as demos. Sits dispositioned NOC (No Contact) / NIS (Not Interested - Shown) are excluded — see the Tie-out panel for the per-code drop count.",
    where: "LP-MCP `computeActuals`: sat leads minus `SCORECARD_NON_DEMO_DISPOSITIONS`.",
    fix: "If the demo count is off, check `non_demo_tally` in the Tie-out panel and adjust the non-demo disposition set.",
  },
  "scorecard.kpi.closePct": {
    title: "% Gross Close",
    what: "Sold ÷ Demos. The headline close rate. Compared to target in the cell color.",
    where: "Derived from `lp_market_scorecard_daily` (sales, demos).",
    fix: "Set the target via the Goals editor (Target Close %).",
  },
  "scorecard.kpi.netClose": {
    title: "# Net Close",
    what: "⚠ Provisional: sold deals that are not cancelled (released OR working both count as 'stuck-but-alive'). No native LP net-close flag.",
    where: "LP-MCP `computeActuals` — sold and not (has job & all jobs cancelled).",
    fix: "Definition is provisional until tied out to the Reece export.",
  },
  "scorecard.kpi.nsli": {
    title: "NSLI",
    what: "⚠ Provisional: Net (released) Sale $ ÷ Issue. Drives the per-day pace targets together with the goal $ and working days.",
    where: "`lp_market_scorecard_daily.nsli` (released_dollars ÷ issued).",
    fix: "Set Trailing NSLI in the Goals editor to drive pace; reconcile the definition to the export.",
  },
  "scorecard.alerts": {
    title: "Scorecard Alerts",
    what: "At-a-glance flags derived from the data already on the page: pace vs MTD goal, Working Revenue held, unmapped sources, and any source over the lead-cost target. No extra data source.",
    where: "Computed in `components/scorecard/ScorecardAlerts.tsx` from the actuals/derived view, source count, and Lead Cost view.",
    fix: "Each alert links conceptually to a section below — pace to the Variance bridge, working revenue to the funnel, sources to Source Performance, cost to Lead Cost.",
  },
  "scorecard.tieout": {
    title: "Tie-out / Reconciliation",
    what: "Admin reconciliation aid. Shows the released/working/other/cancelled bucket split with the identity check (sum = Gross Sales), every distinct job status and its count, and which dispositions were dropped from demos.",
    where: "Reads `raw_inputs` (bucket_tally / status_tally / non_demo_tally) from the latest `lp_market_scorecard_daily` snapshot — emitted by LP-MCP `computeActuals`.",
    fix: "Use the status tally to decide whether any 'other pending' status belongs in `SCORECARD_WORKING_STATUSES`, then re-run the scorecard. When figures match the Reece export, add the market to `SCORECARD_RECONCILED_MARKETS` to clear the PROVISIONAL banner.",
  },
};

export function getHelp(key: string): HelpEntry | null {
  return helpContent[key] ?? null;
}
