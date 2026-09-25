-- Undo 0023 (HL project jtlngmcrtqncimtjjzlz): the hourly job, the snapshot
-- table, the three helpers and the two partial indexes. The Workflows page
-- then shows "not computed" in the Sending column and no verdicts. pg_cron
-- itself is left installed (dropping it would remove any other job).
-- RUN EACH DROP INDEX CONCURRENTLY AS ITS OWN EXECUTION.
select cron.unschedule('dash-send-activity');
drop table if exists public.dash_workflow_send_activity;
drop function if exists public.dash_refresh_send_activity(int);
drop function if exists public.dash_workflow_outcomes(int, int);
drop function if exists public.dash_message_step_heads();
drop function if exists public.dash_outbound_heads(int);
drop function if exists public.dash_tag_additions(int);
drop function if exists public.dash_text_head(text);
drop index concurrently if exists public.lead_events_time_tagsnap_idx;
drop index concurrently if exists public.messages_outbound_sent_idx;
drop index concurrently if exists public.messages_inbound_contact_idx;
drop index concurrently if exists public.lead_events_booked_contact_idx;
