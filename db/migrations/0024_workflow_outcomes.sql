-- Workflows page — what happened AFTER leads entered each workflow.
-- Apply in the HL Supabase project (jtlngmcrtqncimtjjzlz), NOT LP.
-- NOT YET APPLIED (2026-09-25). Requires 0023.
--
-- RUN THE TWO CREATE INDEX CONCURRENTLY STATEMENTS AS THEIR OWN EXECUTIONS in
-- the dashboard SQL editor (they cannot run inside a transaction), then the
-- rest of the file. Everything is IF NOT EXISTS / OR REPLACE — safe to re-run.
--
-- WHY
-- Reading copy alone cannot tell a messaging problem from an offer or traffic
-- problem (Mark, 2026-09-25). This adds the outcome side: for every contact
-- that got `active-<code>` in the window, did they reply, book, or opt out
-- within 14 days of entering? The app sums the rows per workflow
-- (lib/workflows/sendActivity.ts `outcomesFor`) and shows Replied / Booked /
-- Opted out on the workflow page. A contact in several workflows at once is
-- counted for each, so these are leading indicators, not attribution.
--
-- COST: the tag-diff CTE is the same one dash_tag_additions runs (~25 s for
-- 30 days); the three EXISTS probes ride the two new partial indexes. Runs
-- inside the hourly snapshot job, never at page load. Until this file is
-- applied the snapshot row simply has no `outcomes` column and the app
-- shows nothing for it.

create index concurrently if not exists messages_inbound_contact_idx
  on public.messages (ghl_contact_id, sent_at)
  where direction = 'inbound' and deleted_at is null;

create index concurrently if not exists lead_events_booked_contact_idx
  on public.lead_events (contact_id, event_time)
  where event_type = 'appointment_booked';

create or replace function public.dash_workflow_outcomes(days int default 30, follow_days int default 14)
returns table (code text, entries bigint, replied bigint, booked bigint, opted_out bigint)
language sql stable
set statement_timeout = '90s'
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
  ), entered as (
    -- first time each contact got active-<code> in the window
    select substr(t, 8) as code, contact_id, min(event_time) as t0
    from diffed, unnest(tags) t
    where prev is not null and not (t = any(prev)) and t like 'active-%'
      and event_time >= now() - make_interval(days => days)
    group by 1, 2
  ), optouts as (
    select contact_id, min(event_time) as t
    from diffed, unnest(tags) t
    where prev is not null and not (t = any(prev))
      and t in ('dnc', 'dnc-sms', 'do-not-contact', 'stage:dnc', 'unsubscribed', 'stop-bot')
    group by 1
  )
  select e.code, count(*) as entries,
         count(*) filter (where exists (
           select 1 from public.messages m
           where m.ghl_contact_id = e.contact_id and m.direction = 'inbound' and m.deleted_at is null
             and m.sent_at between e.t0 and e.t0 + make_interval(days => follow_days))) as replied,
         count(*) filter (where exists (
           select 1 from public.lead_events a
           where a.contact_id = e.contact_id and a.event_type = 'appointment_booked'
             and a.event_time between e.t0 and e.t0 + make_interval(days => follow_days))) as booked,
         count(*) filter (where exists (
           select 1 from optouts o
           where o.contact_id = e.contact_id
             and o.t between e.t0 and e.t0 + make_interval(days => follow_days))) as opted_out
  from entered e
  group by 1
$$;

alter table public.dash_workflow_send_activity add column if not exists outcomes jsonb;

-- Same job as 0023, now also filling `outcomes`. Re-running this replaces
-- the function in place; the cron schedule from 0023 keeps calling it.
create or replace function public.dash_refresh_send_activity(days int default 30)
returns timestamptz
language plpgsql
set statement_timeout = '180s'
as $$
declare ts timestamptz := now();
begin
  insert into public.dash_workflow_send_activity (computed_at, days, tag_additions, outbound_heads, outcomes)
  select ts, days,
         coalesce((select jsonb_agg(t) from public.dash_tag_additions(days) t), '[]'::jsonb),
         coalesce((select jsonb_agg(h) from public.dash_outbound_heads(days) h), '[]'::jsonb),
         coalesce((select jsonb_agg(o) from public.dash_workflow_outcomes(days, 14) o), '[]'::jsonb);
  -- keep three days of snapshots for comparison, nothing older
  delete from public.dash_workflow_send_activity where computed_at < ts - interval '3 days';
  return ts;
end
$$;

-- Fill one snapshot now rather than waiting for the top of the hour.
select public.dash_refresh_send_activity(30);
