-- Undo 0026 (LP project rcjcgjlqzepicbwhnnjl). Run in the dashboard SQL editor.
-- Delete or re-role any partner rows FIRST, or the role check below fails:
--   delete from public.dashboard_users where role = 'partner';

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('executives', 'exec_read'), ('activity_posts', 'post_read'), ('activity_events', 'event_read'),
      ('fb_message_bank', 'fb_bank_read'), ('fb_subtopics', 'fb_subtopics_read'),
      ('fb_messaging_prompts', 'fb_prompts_read'), ('fb_posts', 'fb_posts_read'),
      ('fb_post_feedback', 'fb_feedback_read'), ('fb_post_metrics', 'fb_metrics_read'),
      ('fb_content_plan', 'fb_content_plan_read'), ('fb_settings', 'fb_settings_read'),
      ('fb_page_metrics', 'fb_page_metrics_read'), ('scorecard_goals', 'scorecard_goals_read'),
      ('lp_market_scorecard_daily', 'scorecard_daily_read'),
      ('scorecard_goals_monthly', 'scorecard_goals_monthly_read'),
      ('scorecard_goal_distributions', 'scorecard_goal_distributions_read'),
      ('lp_report_facts', 'lp_report_facts_read'),
      ('lp_lead_disposition_rows', 'lp_lead_disposition_rows_read'),
      ('claude_changes', 'claude_changes_read'), ('claude_changes_log', 'claude_changes_log_read')
    ) as t(tbl, pol)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('alter policy %I on public.%I using (true)', p.pol, p.tbl);
    end if;
  end loop;
end $$;

alter policy asset_read on public.assets using ((status <> 'draft') or (created_by = current_executive_id()));
alter policy attach_read on public.asset_attachments using (exists (select 1 from public.assets a
  where a.id = asset_attachments.asset_id and ((a.status <> 'draft') or (a.created_by = current_executive_id()))));
alter policy appr_read on public.asset_approvals using (exists (select 1 from public.assets a
  where a.id = asset_approvals.asset_id and ((a.status <> 'draft') or (a.created_by = current_executive_id()))));

drop function if exists public.is_dashboard_staff();

alter table public.dashboard_users drop constraint if exists dashboard_users_partner_id_check;
alter table public.dashboard_users drop column if exists partner_id;
alter table public.dashboard_users drop constraint if exists dashboard_users_role_check;
alter table public.dashboard_users add constraint dashboard_users_role_check check (role in ('operator', 'team'));
