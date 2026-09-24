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

  // ── /bot-review · Phase 1 ───────────────────────────────────────────
  "botReview.aiScore": {
    title: "AI score",
    what: "The AI judge's score for this message, 0–100. It is the LOWEST of five dimensions (relevance, stage fit, trust, clarity, forward momentum), not the average — one broken axis drags the whole score down on purpose, because the queue exists to surface the worst messages.",
    where:
      "`message_scores.overall_score` for replies, `agentic_messages.confidence_score` for nurture, both x100, read through `v_bot_review_queue`.",
    fix: "A dash means the judge has not scored it yet — scoring runs within minutes of the send. If dashes persist for hours, check `BOT_JUDGE_PERSIST` on LP MCP and the Railway logs for `[BotJudge]`.",
  },
  "botReview.messagesSent": {
    title: "Messages sent",
    what: "Bot messages sent to homeowners this ET week — replies, nurture and skips, SMS and email.",
    where: "`v_bot_quality_weekly`, summed across paths and channels for the current ET week.",
    fix: "If this drops near zero, the bot is not sending. Check the Decision Engine heartbeat and agent_actions in Issues before assuming it is a reporting problem.",
  },
  "botReview.problemsCaught": {
    title: "Problems caught",
    what: "Must-review messages a human has scored in the last 7 days. These are the ones the system flagged as already having gone wrong — a lead opted out, the bot stayed silent, the AI judge scored it low, or someone stopped the bot right after.",
    where: "`v_bot_reviews_completed` where review_lane = 'must_review', last 7 days.",
    fix: "The number under it is what is still waiting. If that grows day over day, the must-review lane is not being worked — add a reviewer shift. This replaced '% reviewed', which under a lane system always looked like failure even when everything was fine.",
  },
  "botReview.goodRate": {
    title: "Good rate",
    what: "Reviews marked Good as a share of spot-check reviews in the last 7 days. It comes from the RANDOM SAMPLE only, never from every message.",
    where: "`v_bot_reviews_completed` where review_lane = 'spot_check', counting only calibrated reviewers.",
    fix: "Must-review messages are excluded on purpose: they were picked because something went wrong with them, so including them would measure the triage rather than the bot. Shows a dash under 30 spot checks. When it falls, open Top issues to see which reason is pulling it down.",
  },
  "botReview.lane.must_review": {
    title: "Must review",
    what: "Messages that need a human because something already went wrong: the lead opted out within a day, the bot stayed silent, the AI judge scored it at or below 60, or a stop-bot tag landed within two hours of the send.",
    where: "`v_bot_review_queue.review_lane`, computed from bot_outcomes, message_scores and agent_actions. The thresholds are in `bot_settings`.",
    fix: "Work this lane first — every row here has a rose chip saying which trigger fired. To change what lands here, update `must_review_score_below` or `must_review_include_skips` in bot_settings; the lanes re-partition on the next page load, no deploy.",
  },
  "botReview.lane.spot_check": {
    title: "Spot check",
    what: "A random sample of everything that is not must-review, roughly 15%. This is what the Good rate is measured on.",
    where: "A hash of the message type and reference in `v_bot_review_queue`, compared against `bot_settings.spot_check_rate`.",
    fix: "A message's membership depends only on its identity, never on its score or outcome — so it can never drift in or out when new data lands. Raise `spot_check_rate` to sample more; the existing sample stays in, and more joins it.",
  },
  "botReview.lane.everything": {
    title: "Everything",
    what: "Every message the bot has sent, with the Phase 1 saved views as ordinary filters. Nothing here is asking to be reviewed.",
    where: "`v_bot_review_queue`, unfiltered by lane.",
    fix: "This is the lane for looking something up — a specific lead, a rule you are worried about, or a message someone set aside. Dismissed messages appear here with a slate chip and an Undo link.",
  },
  "botReview.completedWeek": {
    title: "Reviews this week",
    what: "Every review scored in the last 7 days that still stands — undone and removed reviews are not counted.",
    where: "`v_bot_reviews_completed`, last 7 days.",
    fix: "If this is flat while the must-review lane grows, reviewing has stopped. Nothing is lost — the messages wait — but the Good rate goes stale.",
  },
  "botReview.completedMine": {
    title: "Your reviews this week",
    what: "How many of the last 7 days' reviews are yours.",
    where: "`v_bot_reviews_completed` filtered to your email.",
    fix: "Team members only ever see their own rows in this tab. If a review you just submitted is missing, check whether you removed it — use the Retracted filter if you are an admin.",
  },
  "botReview.completedSplit": {
    title: "Good / Needs work / Unsafe",
    what: "How the last 7 days' reviews split across the three verdicts, counted per review rather than per message.",
    where: "`v_bot_reviews_completed`, last 7 days.",
    fix: "This is not the Good rate — it counts every review including must-review ones, so it skews low by design. Use the Scoreboard's Good rate for the honest number.",
  },
  "botReview.completedTeaching": {
    title: "Teaching examples saved",
    what: "Reviews where someone ticked 'Teach the bot to reply like this' in the last 7 days.",
    where: "`v_bot_reviews_completed` where gold = true.",
    fix: "Nothing reaches the bot from these yet — Phase 2 builds the approval step that puts them to work. Marking one now is banking it, not shipping it.",
  },
  "botReview.issuesPer100": {
    title: "Issues per 100",
    what: "Needs work plus Unsafe verdicts per 100 reviewed messages. Normalised by volume so a busy week and a quiet week can be compared.",
    where: "`v_bot_quality_weekly.issues_per_100`.",
    fix: "Use Weakest paths to find the rule behind a jump, then read the actual messages on that path in the Review tab.",
  },
  "botReview.unsafe": {
    title: "Unsafe",
    what: "Messages a reviewer marked Unsafe this week. Each one also raised a GroupMe alert within a minute of being flagged.",
    where: "`v_bot_current_feedback` where verdict = 'unsafe'.",
    fix: "Read the note on each — Unsafe is never a judgement call to leave sitting. If one needs the bot off a lead now, use Stop the bot for this lead in the Review tab.",
  },
  "botReview.aiJudgeAverage": {
    title: "AI judge average",
    what: "The average AI score across messages sent this week, before any human review.",
    where: "`v_bot_quality_weekly.avg_ai_score`, weighted by messages sent.",
    fix: "A wide gap between this and the Good rate means the judge is calibrated differently from your reviewers. Phase 3 reports the agreement directly; until then, treat the judge as a sorting aid, not a verdict.",
  },
  "botReview.topIssues": {
    title: "Top issues",
    what: "How often each reason was picked this ET week, next to last week. Counted per flag, not per message — two reviewers picking the same reason is two pieces of evidence.",
    where: "`v_bot_top_issues`, built from the reason codes on live (non-undone, non-superseded) reviews.",
    fix: "A reason climbing week over week is what Phase 2's nightly grouping turns into a proposed fix. Nothing here changes bot behavior on its own.",
  },
  "botReview.weakestPaths": {
    title: "Weakest paths",
    what: "Good rate by rule or nurture workflow, worst first. A path is a rule like OBJ_PRICE_STRIKE1 or a workflow code like S4.5.",
    where: "`v_bot_quality_weekly`, grouped by path and channel for the current ET week.",
    fix: "Paths under 30 reviewed show 'Not enough data yet' rather than a percentage — at roughly 90 messages a week that is most paths at first. Review more on a path to make its number real.",
  },
  // ── /settings · Integrations grid ───────────────────────────────────
  "settings.integrations": {
    title: "Integrations",
    what: "Whether each external service is actually reachable right now, not just whether its credentials are set. Green = the probe reached the service. Amber = reachable but stale (e.g. GHL last synced over 2 h ago). Red = a definite failure such as a rejected token. Grey = either not configured or could not tell (timed out). Grey is never a pass.",
    where:
      "Live probes on every render of this page: both MCPs (`get_sync_health`), both Supabase instances (one-row read), GHL (HL MCP `/health` + sync freshness), n8n (`/healthz`), Railway (`get_railway_service_status`), and LP MCP `/health/integrations` for the LP API, Five9, Slack and GroupMe. Each probe is capped at a few seconds.",
    fix: "The detail line names the env var or the failure. 'Not configured' → set the named variable on the named service. 'Error' → the credential or the service is broken; check that service's logs. 'Unknown' → the probe could not run; re-check, and if it stays grey treat it as an outage until proven otherwise.",
  },

  // ── /agent · Decision Engine ────────────────────────────────────────
  "agent.activeRules": {
    title: "Active rules",
    what: "Rules the decision engine will currently evaluate. A rule is database config, not code, so this number can change without a deploy.",
    where: "`SELECT count(*) FROM agent_rules WHERE enabled = true` (LP Supabase).",
    fix: "Changing a rule takes effect only after an engine reload — the button for that is on Settings. If a rule you just added is not counted here, it was not saved.",
  },
  "agent.inactiveRules": {
    title: "Inactive rules",
    what: "Rules that exist but are switched off. Kept rather than deleted so the history of what was tried survives.",
    where: "`SELECT count(*) FROM agent_rules WHERE enabled = false` (LP Supabase).",
    fix: "Nothing to do. If a rule you expect to be firing is counted here, that is why it is not firing.",
  },
  "agent.pendingEvents": {
    title: "Events queued",
    what: "System events the decision engine has not processed yet. A handful at any moment is normal; a number that climbs and never falls means the engine has stopped consuming.",
    where: "`SELECT count(*) FROM system_events WHERE processed = false` (LP Supabase).",
    fix: "Check the Heartbeat card below. If the heartbeat is stalled, the engine is not running — check the LP MCP service on Railway. A dormant engine once left 998 events queued for 47 hours.",
  },
  "agent.pendingActions": {
    title: "Actions queued",
    what: "Actions the engine has decided on but not yet carried out, including those waiting on a human approval.",
    where: "`agent_actions` where status is pending or pending_approval (LP Supabase).",
    fix: "If this climbs past a few hundred, the executor is behind. Anything sitting in pending_approval is waiting on a person, not on the system.",
  },
  "agent.executed24h": {
    title: "Executed (24h)",
    what: "Actions the executor completed in the last 24 hours, counted by when they ran rather than when they were filed.",
    where: "`agent_actions` where status = completed and executed_at (or updated_at) is within 24h (LP Supabase).",
    fix: "A sudden drop to zero alongside a climbing queue means the executor stopped. A sudden spike usually follows a bulk import.",
  },
  "agent.failed24h": {
    title: "Failed (24h)",
    what: "Actions that ran and failed in the last 24 hours. A small steady number is normal; a spike is not.",
    where: "`agent_actions` where status = failed and executed_at (or updated_at) is within 24h (LP Supabase).",
    fix: "Look at the error_message on the recent failed rows. Repeated failures of one action_type usually mean a downstream service is rejecting the call, not that the rule is wrong.",
  },
  "agent.heartbeat": {
    title: "Heartbeat",
    what: "How recently the agent system wrote anything at all. Green under 6 minutes, amber under 15, red beyond that.",
    where: "The newest row in `system_events` (LP Supabase). Same reading and the same thresholds as the Decision Engine tile on Overview, so the two can never disagree.",
    fix: "If this is red, automations are not firing. Check the LP MCP service on Railway and the n8n decision-engine workflow.",
  },
  "agent.jobs": {
    title: "Background jobs",
    what: "Every scheduled job on the LP MCP service with its last run. Green ran and worked. Red ran and failed, which includes a job that reported failure without crashing. Amber either could not tell what happened, or has never run at all. Grey is switched off on purpose, or was cut short by a deploy — neither of those is a fault.",
    where: "`v_job_status` (LP Supabase, LP-MCP sql/113_job_runs.sql): the job roster joined to its latest run and a 24-hour tally.",
    fix: "A job showing 'Never run' is the one to chase: it is registered but nothing has happened, which is the failure this page exists to make visible. For a red job, read the summary line, then the detail on its most recent row in `job_runs`. A grey 'Disabled' job names the environment variable that switched it off.",
  },
  "agent.rules": {
    title: "Rules",
    what: "The decision engine's rule set, inactive ones first because those are the surprising ones. 'Needs approval' means the action waits for a person before it runs.",
    where: "`agent_rules` (LP Supabase), newest 200 by priority.",
    fix: "This page is read-only. Rules are database config: change one through the LP MCP tool, then reload the engine from Settings. Before concluding a rule never fires, check `agent_actions.rule_applied` — one thought to be dead had fired 47 times.",
  },

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

  // ── /leads · Customer Journey ─────────────────────────────────
  "leads.list": {
    title: "Leads",
    what: "Every GHL contact, newest entry first, 50 at a time. Click a row to open its journey — what happened, what is happening now, and what is projected to happen next.",
    where: "HL Supabase `contacts` (keyset on date_added, ghl_contact_id), with `opportunities`, `appointments` and the newest `lead_events` row read for the page's ids. No LP call until a row is opened.",
    fix: "A lead that should be here and is not: check it exists in GHL, then use Sync now on Overview — the HL cache may be behind. Filters that use tags (lane, workflow, bot) read the contact's CURRENT tags only.",
  },
  "leads.search": {
    title: "Search",
    what: "One box for name, phone (any format), email, GHL contact id, LP Prospect id or LP lead id. Phone and id searches are exact; name and email match partially.",
    where: "`contacts` first. A short number is matched against the LP Prospect ID (`ZRQAVrzhtzApzLlHmT87`) and LP Lead ID (`GmAVmW6V9sekD7pVONKr`) custom fields, then LP `lp_leads`. A name or phone with no GHL hit falls back to LP MCP `search_leads`.",
    fix: "No hit on a known LP id usually means the GHL contact was never linked (no custom field, no `lp_leads.ghl_contact_id`). Search by phone instead.",
  },
  "leads.now": {
    title: "Now",
    what: "The contact's current position: the workflow(s) they are in (`active-<code>` tags), how far through it they are (highest `sent:<code>-e/s<n>` tag), their funnel stage tag, the appointment that matters (next upcoming, else the latest and its status), and the last call and message.",
    where: "Tags on HL `contacts`; `appointments`; last call from LP MCP `get_contact_timeline`; last message from HL `messages`.",
    fix: "Tags are the enrollment record — not `workflow_executions`, which covers only ~25 workflows. If Now disagrees with GHL, re-sync the contact; if a workflow shows by a legacy code (e.g. W9.0), its registry row is missing a canonical code.",
  },
  "leads.next": {
    title: "Next",
    what: "The next few sends the contact's current workflow is expected to make, and when — PROJECTED from the workflow's step graph, not read from GHL. Also flags when automation is stopped (stop-bot / DNC) or nurture is paused.",
    where: "Current workflow from the `active-<code>` tag → `workflow_registry` → `workflow_steps`. Position from the highest `sent:*` tag; the clock starts when that tag first appeared in `lead_events`. Waits come from each step's `startAfter`, never `delay_minutes`.",
    fix: "GHL has no scheduled-send API, so this is best effort. A projection that says 'depends on' took the first branch of an if/else it could not evaluate. Pause tags (suppress-outbound, cooling-active, hard-disqualified, quarantined) never block a direct reply to the contact.",
  },
  "leads.projected": {
    title: "Projected",
    what: "A dashed row below NOW is a send we expect, not one that happened. It is computed by walking the workflow from the contact's last send and adding each wait.",
    where: "`workflow_steps` + `workflow_connections` + `templates` for the contact's active workflow; anchor time from the `lead_events` tag snapshot.",
    fix: "If projections are consistently early or late for a workflow, open it under Workflows → Messages & timing and check the waits parse (a wait with an unrecognised unit shows as +0m and is flagged).",
  },
  "leads.bot": {
    title: "Bot state",
    what: "Green: the agentic bot is on (`agentic-active`). Grey: stopped (`stop-bot`) or no bot tag. Red: a consent tag — dnc, dnc-sms, do-not-contact, stage:dnc or unsubscribed. Consent outranks everything.",
    where: "Tags on HL `contacts`. Display only — the dashboard never writes tags.",
    fix: "To change it, change the tag in GHL (or through the Decision Engine). A red dot on someone who is actively texting in means a consent tag is stale — check it before replying.",
  },
  "leads.glance": {
    title: "At a glance",
    what: "Counts across the whole journey: messages out and in, calls (LP + Five9), appointments, every workflow the contact has entered, and LP notes.",
    where: "The merged timeline below — HL `messages` and tag history, LP MCP `get_contact_timeline`.",
    fix: "Zero calls on a lead you know was dialed: LP activity may be unavailable (amber banner) or the LP lead is not linked to this GHL contact.",
  },

  // ── /workflows ─────────────────────────────────────────────
  "workflows.total": {
    title: "Total Workflows",
    what: "Every non-deleted workflow in GHL, including drafts. The canonical_code column comes from the workflow_registry table.",
    where: "`workflows` joined to `workflow_registry` (HL Supabase). Filter `deleted_at is null`.",
    fix: "If a workflow is missing, trigger a sync. If a workflow has no canonical code, it hasn't been registered yet — add a row to workflow_registry.",
  },
  "workflows.activeLeads": {
    title: "Active leads",
    what: "How many contacts carry this workflow's `active-<code>` tag right now — i.e. are in it today. Replaces the old 'Last execution' column, which was always blank.",
    where: "HL `contacts.tags`, one count per registered workflow (canonical, legacy and dotless spellings of the code — E.4 stamps `active-w04`). Cached 5 minutes. A dash means unregistered or the count failed.",
    fix: "Tags are the enrollment record; `workflow_executions` covers only ~25 workflows and is not used. A workflow with sends but 0 active leads usually does not stamp an `active-` tag — check its first steps under Logic.",
  },
  "workflows.schedule": {
    title: "Messages & timing",
    what: "Every SMS and email the workflow can send, in send order, with the time since entry. Branches are labelled with the if/else path that leads to them; each node is shown once (first path wins).",
    where: "HL `workflow_steps` + `workflow_connections` (the step graph) and `templates` (bodies). Waits are read from each step's `startAfter` — never `delay_minutes`, which stores 1 for an hour and 43200 for 30 days.",
    fix: "A row flagged 'unreadable wait' counted a wait as 0 because its unit was not minute/hour/day/week — its real time is later. 'AI-written' bodies are generated at send time (ChatGPT step or a custom-field merge), so the template shows only the placeholder.",
  },
  "workflows.activeTab": {
    title: "Leads in this workflow",
    what: "Contacts carrying this workflow's `active-<code>` tag, most recently changed first: when they entered (the tag's first appearance in the current run), how far they are (highest `sent:<code>-e/s<n>` tag), their next PROJECTED send, and their last change.",
    where: "HL `contacts.tags`; entry time from `lead_events` tag snapshots.",
    fix: "'Entered' blank means the tag history does not reach back to the entry — the contact has been in a long time. Click a row for the full journey.",
  },
  "workflows.healthFlags": {
    title: "Health Flags",
    what: "Diagnostic badges flagging workflows with known structural issues: dead (triggers reference missing resources), duplicate trigger, wait bottleneck, or message overlap with another workflow.",
    where:
      "Aggregated from `HL MCP detect_dead_workflows`, `find_duplicate_triggers`, `detect_wait_bottlenecks`, and `detect_message_overlap` (cached 5min).",
    fix: "Click a workflow's name to open its detail page — send schedule, logic, triggers and the leads in it now.",
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
  "scorecard.leadsGoal": {
    title: "Leads goal (planning requirement)",
    what: "How many leads this period's Net Sales goal requires: period goal ÷ Net Sales $ per raw lead. The rate is Σ Net Sales (report 137) ÷ Σ distinct leads (report 135) over cohorts at least 90 days old, measured from the first of the appointment month — Jan–May as of 2026-08-13, $41,357,719 over 56,196 leads, about $736 a lead. Summed then divided, never the average of the monthly rates: averaging weights a light month equally with a heavy one and reads about $14 high. An earlier version divided issues-needed by a historical ISSUE rate — an appointment-grain numerator over a lead-grain rate — and was deleted; this replaces it with one ratio that absorbs every downstream loss and needs no bridge between lead grain and appointment grain.",
    where:
      "Computed in `lib/scorecard/leadRate.ts` from `lp_cohort_maturation` (137 Net Sales, appointment cohort) and `lp_report_facts` `leads_distinct` (135, lead cohort). Eligibility reuses `MATURE_RATE_ELIGIBILITY_DAYS` — the same 90-day start-anchored window as Settled Net Retention, so the two published rates cannot drift apart in how they pick their sample. A market below `MIN_LEADS_FOR_OWN_RATE` falls back to the company rate and the row says so. Report 135's own NetAmount is never read.",
    fix: "Expect a large gap: a ~$11.0M company goal implies roughly 15,000 leads a month against a run rate near 10,000. That is the finding, not a bug — the goal is not rescaled to close it. The Actual is DISTINCT leads, the same unit as the rate's denominator; if it looked like a row count it would read about 7% high. Leads sits above a rule because it is a planning row on the LEAD cohort, while everything below it is report 137 on the appointment cohort — the two are never divided into one another.",
  },
  "scorecard.issueRate": {
    title: "Issue rate (calculated)",
    what: "Issued ÷ raw leads in over the trailing rate window — the observed share of TRUE top-of-funnel leads that become issued appointments (ruled 2026-08-05; the warehouse `leads` column is the appointment-set cohort and structurally equals Sets, so it is not the denominator). A DERIVED data point (never a target ops sets); it turns issues-needed into leads-needed in the goal chain. Not the same as % Issue (issued ÷ sets).",
    where:
      "Computed in `computeTrailingRates` (`lib/queries/scorecard.ts`) from `lp_market_scorecard_daily.raw_leads_in` (tracked from June 2026 — earlier months are excluded from both sides of the ratio), sharing the NSLI window and its widening/fallback rules, anchored to the selected period.",
    fix: "A null issue rate means the window has no raw-leads months — check the warehouse rows for the market's trailing months. The basis tooltip on the NSLI tile shows which window produced it.",
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
    what: "Per-source funnel for the latest snapshot, By Appt Date — leads, issued, demo%, close%, Net Sale (non-cancelled $), pending, and NSLI, with the same released/working/cancel definitions as the aggregate. 'Quality' flags a source's close% vs the REECE average: Strong (≥ average), OK (≥ half), Weak (< half). Sortable; default sort is Net Sales. Sources that don't resolve through lp_source_mapping are marked ⚠ and counted in the header badge.",
    where:
      "`lp_source_scorecard_daily` (latest snapshot), written daily by the LP-MCP job in the same run as the aggregate row via `computeActuals(..., { groupBy:['source','sub_source'] })`. Read by `lib/queries/sources.ts`.",
    fix: "If a source is ⚠ unmapped, add it to `lp_source_mapping` (ties to lp_unmapped_sources). Per-source numbers inherit the aggregate's PROVISIONAL status until reconciled. Backfill a window via `POST /n8n/admin/goal-scorecard-run`.",
  },
  "scorecard.leadcost": {
    title: "Lead Cost",
    what: "Per-source spend efficiency over the snapshot window: spend, cost per lead, cost as % of Net Sale (non-cancelled $), and ROMI (Net Sale ÷ spend). Cost % is green at/under the target, amber up to ~1.3× target, red above. Sources with no spend show 'Spend not connected' instead of a misleading 0% — spend is never invented.",
    where:
      "`lib/queries/leadcost.ts` joins `lp_source_scorecard_daily` (collapsed to source) to `lp_source_spend_daily` over the MTD window, plus the existing LeadGurus feed (`ft_daily_summary`) attributed to the 'Lead Gurus' source. Target % is `SCORECARD_LEADCOST_TARGET_PCT` (default 15).",
    fix: "To light up a source, land daily spend in `lp_source_spend_daily` (market, source, sub_source, spend_date, spend). The Lead Gurus row fills automatically from the LeadGurus daily pull. Adjust the target via `SCORECARD_LEADCOST_TARGET_PCT` on the dashboard service.",
  },

  // ── /scorecard · per-KPI + Phase 4 UX ────────────────────────────────
  "scorecard.kpi.netsales": {
    title: "Net Sale",
    what: "Every non-cancelled sold dollar — Net Sale = Gross − Cancelled = Released + Working + Open Quotes. Matches the Reece report's 'Net Sale' and is consistent with the Net Close COUNT (both span all non-cancelled deals). This is the headline goal metric. The Released / Working / Open Quotes split is shown separately (Working Revenue, Open Quotes rows, and the Tie-out panel) as a pipeline-risk breakdown.",
    where: "`lp_market_scorecard_daily.net_sales` (= released_dollars + working_dollars + other_pending). Cancelled $ is excluded via `SCORECARD_CANCEL_STATUSES`; the Released subset is `SCORECARD_RELEASED_STATUSES`.",
    fix: "To change what counts as cancelled (and therefore what's excluded from Net Sale), edit `SCORECARD_CANCEL_STATUSES` (env, no code) and re-run. Use the Tie-out panel status tally to calibrate the gross→net haircut against the report.",
  },
  "scorecard.kpi.working": {
    title: "Working Revenue",
    what: "Sold but HELD dollars — financing/HOA/docs/measure not yet released to production. Earned but not yet bookable, and a pipeline risk if it stalls. Counts toward Net Close and Net Sale (it's non-cancelled), but is the held — not-yet-released — slice of it.",
    where: "`lp_market_scorecard_daily.working_dollars`. Statuses in `SCORECARD_WORKING_STATUSES`.",
    fix: "If a status is misclassified, adjust `SCORECARD_WORKING_STATUSES` (env, no code change) and re-run the scorecard. Cross-check against the status tally in the Tie-out panel.",
  },
  "scorecard.kpi.pending": {
    title: "Pending Revenue (Working)",
    what: "Pending Revenue = Working only (sold but held: financing/HOA/docs/measure). Open quotes (sold leads whose job is still pre-firm) are NOT included — they're a separate Open Quotes line — so Pending isn't inflated by unsigned quotes.",
    where: "`lp_market_scorecard_daily.pending_dollars` (= working_dollars; `raw_inputs.pending_basis` = 'working_only').",
    fix: "If a held status is misclassified, edit `SCORECARD_WORKING_STATUSES` (env) and re-run. Cross-check the Tie-out panel status tally.",
  },
  "scorecard.kpi.openQuotes": {
    title: "Open Quotes",
    what: "Sold leads whose job is still in a pre-firm status (Quoted/New/Await Rep) — neither released nor a sold-but-held deal. Kept separate from Pending Revenue so it can't inflate it. A large value usually means leads flagged sold while the job lags in Quoted, or genuine open pipeline.",
    where: "`lp_market_scorecard_daily.raw_inputs.bucket_tally.other_pending`. A diagnostic sample of these leads is in `raw_inputs.suspect_sold_sample`.",
    fix: "Review `raw_inputs.suspect_sold_sample` (lead id + per-status $) to tell stuck-sold (workflow lag) from real open pipeline. If a pre-firm status should count as Working, add it to `SCORECARD_WORKING_STATUSES`.",
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
    title: "Net Sales $ per Issued Appointment",
    what: "⚠ Provisional: Net Sale $ ÷ Issue (Net Sale = non-cancelled total). Drives the per-day pace targets together with the goal $ and working days.",
    where: "`lp_market_scorecard_daily.nsli` (net_sales ÷ issued).",
    fix: "Set the trailing rate in the Goals editor to drive pace; reconcile the definition to the export. NEVER call it 'per Issued Lead' — the denominator is appointment grain.",
  },
  "scorecard.kpi.goodRate": {
    title: "Good Rate %",
    what: "(Sold gross − cancellations) ÷ sold gross — the share of sold dollars that survive (aren't cancelled). Single sold basis. Higher is better; compared to target in the cell color.",
    where: "`lp_market_scorecard_daily.good_rate_pct` ((gross_sales − cancellations) ÷ gross_sales, both sold-basis). Aggregate periods gross-weight the monthly rate.",
    fix: "Set the target via the Goals editor (Target Good Rate %). A low rate points to cancellations — see the Tie-out bucket split.",
  },
  "scorecard.kpi.ko": {
    title: "KO %",
    what: "Knock-out rate: cancelled deals ÷ Sold. Lower is better. Cancels are the statuses in SCORECARD_CANCEL_STATUSES.",
    where: "`lp_market_scorecard_daily.ko_pct` (ko_count ÷ sales).",
    fix: "Set the target via the Goals editor (Target KO %). If a status is misclassified as a cancel, adjust SCORECARD_CANCEL_STATUSES and re-run.",
  },
  "scorecard.kpi.diagnostic": {
    title: "Diagnostic metric",
    what: "This row is informational only — it has no goal/target by design (e.g. Gross Sale $, Working Revenue, Open Quotes, GSLI, Net Issue). The goal columns show 'n/a' rather than a target.",
    where: "Rendered in `components/scorecard/FunnelTable.tsx`; values come from `lp_market_scorecard_daily`.",
    fix: "Nothing to set — use the value to read pipeline health alongside the goal-bearing rows above it.",
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

  // ── /command-center · Rulings, Stale issues and To-dos ─────────────────
  "commandCenter.rulingsOpen": {
    title: "Waiting on you",
    what: "Everything in memory that needs a ruling: open or blocked pending items of the four ruling types (decision needed, unconfirmed, open question, approval needed), plus open conflicts where two memory rows disagree. Snoozed cards are not counted until their date comes round.",
    where: "`SELECT count(*) FROM v_command_center_queue WHERE lane = 'rulings'` (LP Supabase, sql/102).",
    fix: "If this looks far too high, check the Area and Type filters are clear. If it is stuck at the same number while you rule, something is failing to save — look for a red line on the card.",
  },
  "commandCenter.oldest": {
    title: "Oldest",
    what: "How many days the longest-waiting card in the queue has been open. The queue already sorts risk-first, so a large number here is usually something low-risk rather than something forgotten.",
    where: "The largest `age_days` in `v_command_center_queue`.",
    fix: "Filter by that card's area to find it. If it genuinely no longer matters, rule it 'No longer relevant' rather than leaving it to age.",
  },
  "commandCenter.ruledThisWeek": {
    title: "Ruled this week",
    what: "How many rulings were made in the last seven days, and the change against the seven days before that. Counts every ruling — from this page and from chat — including flips.",
    where: "Rows in `claude_rulings_log` by `at` (LP Supabase, sql/102).",
    fix: "Zero while you have been ruling means the audit rows are not landing: check the LP MCP deploy is ACTIVE and that sql/102 section B applied.",
  },
  "commandCenter.agreement": {
    title: "AI agreement",
    what: "How often the ruling matched what the AI suggested, over the last 500 rulings — with the high-confidence figure underneath, which is the one that matters. A high-confidence recommendation being wrong often is the signal that the AI is not earning its one-click Approve. A dash means there are not yet ten rulings to measure.",
    where: "`action` against `rec_verdict` on `claude_rulings_log`, with the confidence read back off the source card. Rulings with no verdict equivalent (stage, flip, re-check, no-longer-relevant) and option picks are left out.",
    fix: "A falling score is not a bug to fix here — it is the reason box doing its job. Read the reasons on the Decided tab: if the AI keeps missing the same way, that belongs in the prompt in `src/jobs/memory-recommend.js`.",
  },
  "commandCenter.changesLane": {
    title: "Changes",
    what: "What was approved and how far it has got: proposed, approved, testing, ready to merge, deployed, failed, rolled back. Status is computed from facts (a PR number, a CI result, a merge) by a database trigger — nothing sets it by hand, so the badge cannot drift from reality.",
    where: "`claude_changes` (migration 0020), backfilled from `claude_pending_items` where item_type is build_needed.",
    fix: "Most rows have no decision behind them: they were captured during working sessions, not filed by a ruling, and the card says so. Set the lane before generating a prompt — code, agent rules and GHL workflows are different jobs and produce different instructions.",
  },
  "commandCenter.staleLane": {
    title: "Stale issues",
    what: "Open issues with no verification in 60+ days and no activity in 60+ days — the nightly job flags them. The lane asks one question about each: is this still broken? \"Still broken\" re-starts the clock and closes nothing, which is why it is the safe answer when you do not know. \"Fixed\" is the only one that needs a link.",
    where: "`v_command_center_queue` where lane is 'stale' — `claude_known_issues` open or in_progress, `stale` true, and not snoozed.",
    fix: "Rule them here, one at a time or in a pass. If the number never falls, check MEMORY_RECOMMEND_MODE: a lane with no recommendations has no passes, so everything has to be clicked one by one.",
  },
  "commandCenter.todoLane": {
    title: "To-dos",
    what: "Every open work item that is not a decision: builds, actions, verifications, next steps — including anything a ruling filed as 'needs building', any ROLL BACK item a flip created, and the 654 rows whose item_type was a one-off or missing altogether. Those were invisible until this lane existed.",
    where: "`v_command_center_queue` where lane is 'todos' — `claude_pending_items` open or blocked, minus the four ruling types, and not snoozed. The type badge is `claude_item_type_norm`, which is display only: the stored value is left exactly as the session that filed it wrote it.",
    fix: "Done / Drop / Keep / Assign. Keep snoozes for 30 days and closes nothing, so it is the honest answer for anything still real. A ROLL BACK item means a built decision was flipped and the build still needs undoing — do those first.",
  },
  "commandCenter.batchPass": {
    title: "Ready to clear together",
    what: "Cards the nightly is confident about AND gave the same reason for, so they can be ruled in one click. Everything in a group is listed with its own evidence and its own checkbox — the group is a shortcut, not a shortcut past reading.",
    where: "`v_command_center_queue` rows with `rec_confidence` = high, grouped by `rec_group_key`. One pass is one transaction with one batch_id in `claude_rulings_log`.",
    fix: "No groups showing means no high-confidence recommendations on this lane — run /admin/memory/recommend, or check MEMORY_RECOMMEND_MODE. Medium-confidence cards are never grouped on purpose: unsure work gets looked at one card at a time.",
  },
  "commandCenter.batchGroup": {
    title: "One group",
    what: "Every card here shares the reason in the heading. Boxes start checked because that is what the group means; unchecking one leaves it for the one-at-a-time list below. A pass rules at most 50 at once — about as many lines as anyone actually reads before clicking.",
    where: "Applied through memory_rule's batch_apply → `claude_rule_batch`, which writes one log row per card plus a summary row, all sharing a batch_id.",
    fix: "Refused? The reason is on the button. A pass drops the WHOLE group if any card changed since the screen loaded — reload and check it again. Anything it will not take can still be ruled on its own.",
  },
  "commandCenter.batchUndo": {
    title: "Undo a pass",
    what: "Puts every card in that pass back exactly as it was, and writes a reversing row for each, so the history shows both what happened and that it was taken back.",
    where: "`claude_rule_batch_undo`, which validates the whole batch before it touches a row — a half-undone pass cannot exist.",
    fix: "Refused with \"changed since\"? Somebody has ruled on one of those cards in the meantime, and their ruling is not ours to overwrite. The message names the card — fix that one by hand and leave the rest as they are.",
  },
  "commandCenter.inOmiBadge": {
    title: "In Omi",
    what: "This to-do is also a task on Mark's Omi Tasks page, so ticking it off here is not the only place it lives. Write-back put it there — the Reece row and the Omi task are the same thing.",
    where: "`claude_pending_items.omi_action_item_id`, set the moment Omi accepted the task.",
    fix: "Nothing. That id is also the loop guard: it is what stops the puller reading our own task back in as a brand-new to-do every fifteen minutes.",
  },
  "commandCenter.recommendation": {
    title: "Suggested",
    what: "What the record supports, written by the nightly recommendation step: a verdict, two sentences of reason, and the evidence behind it. It is NEVER a ruling — nothing here closes a card or writes a decision. Confidence is capped at medium whenever money, live leads or customer messaging are at stake.",
    where: "The `rec_*` columns on the card, written by `src/jobs/memory-recommend.js` when MEMORY_RECOMMEND_MODE is live.",
    fix: "Missing means the nightly has not reached this card, or the mode is off — hit Re-check, or set MEMORY_RECOMMEND_MODE. The button it points at is marked “AI suggests”, so agreeing is one click. Disagreeing is normal: choose the other answer and say why in one line.",
  },
  "commandCenter.riskBadge": {
    title: "Risk badge",
    what: "Money, Live leads or Customer messaging — flagged when a ruling could move revenue, affect leads in flight, or change what a customer receives. Payroll and partner/vendor areas are always treated as money, whatever the model said.",
    where: "`rec_risk` on the card. The area backstop is in `normalizeOutput()` in memory-recommend.js.",
    fix: "A risk badge is a reason to read the tradeoff before clicking, not a reason to stop. If it is wrong, rule it and say why — that reason is what trains the next look.",
  },
  "commandCenter.omiBadge": {
    title: "Heard on Omi",
    what: "This card came from something said out loud, captured by the Omi recorder, not from a chat session. Omi items are ALWAYS unconfirmed — nothing heard is ever treated as decided until it is ruled here or in chat.",
    where: "`origin = 'omi'` on the pending item (sql/101). The '[Omi date]' prefix is stripped from the text on screen and on save.",
    fix: "Treat it as a proposal, not a decision. Approving it is what makes it real.",
  },
  "commandCenter.conflictCard": {
    title: "Conflict",
    what: "Two memory rows on the same subject that contradict each other — the nightly conflict scan files these when their similarity is at or above 0.85. Until one is ruled, memory holds both as true.",
    where: "`claude_memory_conflicts` where status is open, with both sides resolved in `v_command_center_queue`.",
    fix: "Read the origin and confidence on each side: a decision Mark confirmed outranks a reconstructed one regardless of date. Keep one, or write a new answer that supersedes both.",
  },
  "commandCenter.flip": {
    title: "Flip",
    what: "Undo a ruling. The exact values it changed are restored from the audit row, and the flip is recorded as its own row — nothing is ever erased and there is no time limit. A two-sided ruling flips across (approve becomes reject, keep left becomes keep right).",
    where: "`claude_rulings_log.changes` holds the before/after of every column the ruling touched; the flip is applied by `claude_rule_apply`.",
    fix: "If a flip is refused with 'changed since', something the ruling touched has been edited elsewhere, so it can no longer be put back exactly — rule the card again instead.",
  },
  "commandCenter.stage": {
    title: "Rollout stage",
    what: "How far a decision has got: Decided, Built, Verified, or No build needed. Only decisions made through the Command Center carry a stage — every decision that existed before stays untracked. Verified requires a line saying what proved it.",
    where: "`claude_decision_log.rollout_stage`, `built_at` and `verification_note` (sql/102 section A).",
    fix: "Set Built when the work ships and Verified when you have actually seen it working. Flipping a decision that reached Built or Verified files a ROLL BACK to-do, because the record going back does not undo the build.",
  },
};

export function getHelp(key: string): HelpEntry | null {
  return helpContent[key] ?? null;
}
