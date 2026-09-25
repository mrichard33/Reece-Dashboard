-- Workflows page — "is this workflow actually sending?" (last 30 days).
-- Apply in the HL Supabase project (jtlngmcrtqncimtjjzlz), NOT LP.
--
-- RUN THE TWO CREATE INDEX CONCURRENTLY STATEMENTS AS THEIR OWN EXECUTIONS in
-- the dashboard SQL editor (they cannot run inside a transaction). Everything
-- is IF NOT EXISTS / OR REPLACE — safe to re-run.
--
-- STATUS: this file, `create extension pg_cron`, and one snapshot
-- (`select dash_refresh_send_activity(30)`, 2026-09-24 23:24 ET) were already
-- applied to HL on 2026-09-25 through the Supabase MCP, before the rule
-- "schema changes go through the dashboard only" was set. Nothing else here
-- is pending. To undo all of it, run 0023_workflow_send_activity.rollback.sql
-- in the dashboard SQL editor. 0024 (outcomes) has NOT been applied.
--
-- WHY
-- A "published" workflow can accept leads and never send a message (F.0 had
-- 465 leads in it and no message stamps on 2026-09-25). GHL exposes no
-- per-message on/off flag beyond its "skip action" toggle, so the dashboard
-- counts REAL activity instead. Three read-only helpers feed
-- lib/workflows/sendActivity.ts; the app only SELECTs from them and caches
-- the result for 10 minutes. Nothing here writes.
--
--   dash_tag_additions(days)   sent:<code>-e<n>|s<n> and active-<code> tags
--                              ADDED to a contact in the window (lead_events
--                              tag snapshots, LAG per contact). Precise for
--                              the workflows that stamp a sent:* tag.
--   dash_outbound_heads(days)  distinct outbound SMS/email "heads" (first 240
--                              chars of plain text) with counts. Matched in
--                              the app against each message step's own head,
--                              for workflows that stamp nothing.
--   dash_message_step_heads()  the same normaliser over the workflow steps.
--
-- COST (measured 2026-09-25): dash_tag_additions(30) = 25 s even with the
-- partial index (lead_events holds ~2.3M rows, ~400K in the window);
-- dash_outbound_heads(30) = 1.5 s. Too slow for a page load, so an hourly
-- pg_cron job (bottom of this file) writes both results into ONE row of
-- dash_workflow_send_activity and the app reads the newest row. The page
-- shows "as of <computed_at>". dash_message_step_heads() is fast and is
-- called live.
--
-- EMAIL HEADS: a stored email template starts with the preheader
-- boilerplate ("{{contact.ai_email_preview_draft}} &zwnj; …"), while the
-- SENT body starts with the rendered preheader text. So for emails the
-- step head is the step's own preHeader (or subject), which is what the
-- first 240 characters of the sent body begin with. Verified 2026-09-25:
-- 28 of 160 published email steps match a send in the last 30 days this way
-- (the rest either did not send or carry a merge field, handled in the app).

create index concurrently if not exists lead_events_time_tagsnap_idx
  on public.lead_events (event_time desc)
  where event_type in ('contact_updated', 'contact_created');

create index concurrently if not exists messages_outbound_sent_idx
  on public.messages (sent_at desc)
  where direction = 'outbound' and deleted_at is null;

-- One normaliser for both sides, so a stored template and a sent body
-- compare equal: strip <style> blocks and tags, collapse whitespace, take
-- the first 240 characters.
create or replace function public.dash_text_head(t text) returns text
language sql immutable as $$
  select left(
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(t, ''), '<style[^>]*>.*?</style>', ' ', 'gi'),
          '<[^>]+>', ' ', 'g'),
        '&(nbsp|zwnj|zwj|shy|#8203|#847);', ' ', 'g'),
      '\s+', ' ', 'g')),
    240)
$$;

create or replace function public.dash_tag_additions(days int default 30)
returns table (tag text, adds bigint, contacts bigint)
language sql stable
set statement_timeout = '20s'
as $$
  with snaps as (
    select contact_id, event_time,
           array(select lower(x) from jsonb_array_elements_text(raw_json->'tags') x
                 where x ilike 'sent:%' or x ilike 'active-%') as tags
    from public.lead_events
    where event_type in ('contact_updated', 'contact_created')
      and event_time >= now() - make_interval(days => days + 1)
      and jsonb_typeof(raw_json->'tags') = 'array'
  ), diffed as (
    select contact_id, event_time, tags,
           lag(tags) over (partition by contact_id order by event_time) as prev
    from snaps
  )
  select t as tag, count(*) as adds, count(distinct contact_id) as contacts
  from diffed, unnest(tags) t
  where prev is not null and not (t = any(prev))
    and event_time >= now() - make_interval(days => days)
  group by t
$$;

create or replace function public.dash_outbound_heads(days int default 30)
returns table (type text, head text, sends bigint, contacts bigint)
language sql stable
set statement_timeout = '20s'
as $$
  select type, lower(public.dash_text_head(body)) as head,
         count(*) as sends, count(distinct ghl_contact_id) as contacts
  from public.messages
  where direction = 'outbound' and deleted_at is null and type in ('2', '3')
    and sent_at >= now() - make_interval(days => days)
    and coalesce(body, '') <> ''
  group by 1, 2
$$;

create or replace function public.dash_message_step_heads()
returns table (workflow_id text, step_id text, step_type text, head text)
language sql stable
as $$
  select s.workflow_id, s.step_id, s.step_type,
         lower(public.dash_text_head(case
           when s.step_type = 'email' then coalesce(
             nullif(s.raw_json->'raw'->'data'->>'preHeader', ''),
             nullif(s.raw_json->'raw'->'data'->>'subject', ''),
             t.subject)
           else coalesce(
             nullif(s.raw_json->'raw'->'data'->>'html', ''),
             nullif(s.raw_json->'raw'->'data'->>'body', ''),
             nullif(s.raw_json->'raw'->'data'->>'message', ''),
             t.body)
         end)) as head
  from public.workflow_steps s
  left join public.templates t
    on t.ghl_template_id = coalesce(s.template_id, s.raw_json->'raw'->'data'->>'templateId', s.raw_json->'raw'->'data'->>'template_id')
   and t.deleted_at is null
  where s.step_type in ('sms', 'email')
$$;

-- ── Hourly snapshot (pg_cron) ─────────────────────────────────────────────
-- pg_cron 1.6 was enabled on this project 2026-09-25 (create extension).
create table if not exists public.dash_workflow_send_activity (
  computed_at     timestamptz primary key default now(),
  days            int not null default 30,
  tag_additions   jsonb not null,   -- rows of dash_tag_additions(days)
  outbound_heads  jsonb not null    -- rows of dash_outbound_heads(days)
);

create or replace function public.dash_refresh_send_activity(days int default 30)
returns timestamptz
language plpgsql
set statement_timeout = '120s'
as $$
declare ts timestamptz := now();
begin
  insert into public.dash_workflow_send_activity (computed_at, days, tag_additions, outbound_heads)
  select ts, days,
         coalesce((select jsonb_agg(t) from public.dash_tag_additions(days) t), '[]'::jsonb),
         coalesce((select jsonb_agg(h) from public.dash_outbound_heads(days) h), '[]'::jsonb);
  -- keep three days of snapshots for comparison, nothing older
  delete from public.dash_workflow_send_activity where computed_at < ts - interval '3 days';
  return ts;
end
$$;

-- Every hour at :07. Re-running this file re-schedules the same job name.
select cron.schedule('dash-send-activity', '7 * * * *', $$select public.dash_refresh_send_activity(30)$$);
