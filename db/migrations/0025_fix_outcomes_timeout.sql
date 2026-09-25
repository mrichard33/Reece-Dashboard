-- Fix: 0024 made the hourly send-activity job time out, so no snapshots.
-- Apply in the HL Supabase project (jtlngmcrtqncimtjjzlz), NOT LP.
-- NOT YET APPLIED (2026-09-25). Requires 0023 and 0024.
--
-- No CREATE INDEX CONCURRENTLY here, so the whole file can be pasted and run
-- as ONE execution in the dashboard SQL editor. Everything is OR REPLACE —
-- safe to re-run.
--
-- WHAT BROKE (2026-09-25)
-- After 0024 was applied, the 13:07 and 14:07 ET runs of the
-- `dash-send-activity` cron job both failed with "canceling statement due to
-- statement timeout" inside dash_workflow_outcomes. The job inserts nothing
-- when any part fails, so the Workflows page's send counts stopped updating
-- at the 12:07 snapshot. After 6 hours the dashboard's freshness gate
-- (lib/workflows/sendActivity.ts `freshness`) treats the snapshot as too old
-- and every "No sends seen" verdict falls back to "unknown" — by design it
-- never raises a false alarm, but it does go blind.
--
-- WHY IT WAS SLOW
-- The opt-out check was `exists (select 1 from optouts ...)` against a CTE,
-- which has no index, so Postgres scanned the whole opt-out list once per
-- entered (workflow, contact) pair — ~11,400 scans for 30 days. The tag-diff
-- work was also done twice (once per CTE that needed it).
--
-- THE FIX
-- 1. dash_workflow_outcomes: compute the tag diff once (`adds`), then join
--    opt-outs with a hash join instead of a per-row scan. Same output columns,
--    same meaning. Measured with EXPLAIN ANALYZE on live data, 30 days:
--    13.0 s (the old version was cut off at 120 s).
-- 2. dash_refresh_send_activity: the outcomes step can no longer take the
--    snapshot down with it. Send counts and entries are computed first; if
--    outcomes fails or is cancelled, the snapshot still saves with
--    outcomes = NULL (the dashboard then simply hides the outcome tiles) and
--    a WARNING is logged in cron.job_run_details.
--
-- NOTE ON TIMEOUTS: both failures ended exactly 2 minutes after the job
-- started, not at the 90 s / 180 s set on the functions. A function-level
-- `set statement_timeout` does not extend a statement that is already
-- running; the cap is the calling role's own timeout. So the SET clauses are
-- dropped here rather than left to suggest a limit that isn't the real one.

create or replace function public.dash_workflow_outcomes(days int default 30, follow_days int default 14)
returns table (code text, entries bigint, replied bigint, booked bigint, opted_out bigint)
language sql stable
as $$
  with snaps as (
    select contact_id, event_time,
           array(select lower(x) from jsonb_array_elements_text(raw_json->'tags') x
                 where x ilike 'active-%'
                    or lower(x) in ('dnc', 'dnc-sms', 'do-not-contact', 'stage:dnc', 'unsubscribed', 'stop-bot')) as tags
    from public.lead_events
    where event_type in ('contact_updated', 'contact_created')
      and event_time >= now() - make_interval(days => days + 1)
      and jsonb_typeof(raw_json->'tags') = 'array'
  ), diffed as (
    select contact_id, event_time, tags,
           lag(tags) over (partition by contact_id order by event_time) as prev
    from snaps
  ), adds as (
    -- every tag ADDED to a contact, computed once and reused below
    select contact_id, event_time, t
    from diffed, unnest(tags) t
    where prev is not null and not (t = any(prev))
  ), entered as (
    -- first time each contact got active-<code> in the window
    select substr(t, 8) as code, contact_id, min(event_time) as t0
    from adds
    where t like 'active-%' and event_time >= now() - make_interval(days => days)
    group by 1, 2
  ), optouts as (
    -- `snaps` keeps only active-* and the opt-out tags, so anything else is an opt-out
    select contact_id, min(event_time) as t
    from adds
    where t not like 'active-%'
    group by 1
  )
  select e.code,
         count(*) as entries,
         count(*) filter (where exists (
           select 1 from public.messages m
           where m.ghl_contact_id = e.contact_id and m.direction = 'inbound' and m.deleted_at is null
             and m.sent_at between e.t0 and e.t0 + make_interval(days => follow_days))) as replied,
         count(*) filter (where exists (
           select 1 from public.lead_events a
           where a.contact_id = e.contact_id and a.event_type = 'appointment_booked'
             and a.event_time between e.t0 and e.t0 + make_interval(days => follow_days))) as booked,
         count(*) filter (where o.t between e.t0 and e.t0 + make_interval(days => follow_days)) as opted_out
  from entered e
  left join optouts o on o.contact_id = e.contact_id
  group by 1
$$;

create or replace function public.dash_refresh_send_activity(days int default 30)
returns timestamptz
language plpgsql
as $$
declare
  ts          timestamptz := now();
  v_tags      jsonb;
  v_heads     jsonb;
  v_outcomes  jsonb;
begin
  -- The parts the Workflows page cannot do without come first.
  v_tags  := coalesce((select jsonb_agg(t) from public.dash_tag_additions(days) t), '[]'::jsonb);
  v_heads := coalesce((select jsonb_agg(h) from public.dash_outbound_heads(days) h), '[]'::jsonb);

  -- Outcomes are extra. If they fail or run out of time, save the snapshot
  -- without them rather than saving nothing (the 2026-09-25 outage).
  begin
    v_outcomes := coalesce((select jsonb_agg(o) from public.dash_workflow_outcomes(days, 14) o), '[]'::jsonb);
  exception when query_canceled or others then
    raise warning 'dash_refresh_send_activity: outcomes skipped (%)', sqlerrm;
    v_outcomes := null;
  end;

  insert into public.dash_workflow_send_activity (computed_at, days, tag_additions, outbound_heads, outcomes)
  values (ts, days, v_tags, v_heads, v_outcomes);

  -- keep three days of snapshots for comparison, nothing older
  delete from public.dash_workflow_send_activity where computed_at < ts - interval '3 days';
  return ts;
end
$$;

-- Fill one snapshot now rather than waiting for the next :07.
select public.dash_refresh_send_activity(30);
