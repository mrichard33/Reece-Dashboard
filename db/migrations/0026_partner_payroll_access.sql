-- Payroll partner access — partner accounts, and staff-only reads for everyone else.
-- Apply in the LP Supabase project (rcjcgjlqzepicbwhnnjl), where dashboard_users lives.
-- Run in the dashboard SQL editor as ONE execution. Idempotent. Rollback:
-- 0026_partner_payroll_access.rollback.sql.
--
-- WHY (2026-09-27)
-- LightFire, a payroll partner, gets a dashboard login to see its weekly pay
-- lines and file dispute tickets. It is the first account that is NOT Reece
-- staff, and that changes what "any signed-in user" means:
--
--   1. dashboard_users gains role 'partner' and a partner_id. The app keeps a
--      partner out of every existing page and API: lib/auth getSessionUser
--      returns null for them, so everything that gates on it treats a partner
--      as signed out. They reach only /partner/payroll.
--
--   2. Twenty-odd RLS policies grant SELECT to the `authenticated` role with
--      USING (true). Harmless while every Supabase Auth user was staff; with a
--      partner login, the public anon key plus a partner session could read
--      lp_lead_disposition_rows (customer names, phones, addresses),
--      lp_report_facts, scorecards, claude_changes and the FB content tables
--      straight from PostgREST, bypassing the app. Each such policy now also
--      requires is_dashboard_staff(). Staff lose nothing: every staff member,
--      exec-only reviewers included, has a dashboard_users row with role
--      operator or team.
--
-- The payroll tables themselves (payroll_*, pay_rules, payroll_disputes) have
-- RLS on with NO policies, so only the service role reads them. The dashboard
-- reads them server-side, scoped to the signed-in partner.

-- ─── 1. Partner accounts ─────────────────────────────────────────────────
alter table public.dashboard_users drop constraint if exists dashboard_users_role_check;
alter table public.dashboard_users add constraint dashboard_users_role_check
  check (role in ('operator', 'team', 'partner'));

alter table public.dashboard_users add column if not exists partner_id uuid references public.lf_partners(id);

-- A partner row must name its partner; a staff row must not.
alter table public.dashboard_users drop constraint if exists dashboard_users_partner_id_check;
alter table public.dashboard_users add constraint dashboard_users_partner_id_check
  check ((role = 'partner') = (partner_id is not null));

-- ─── 2. Staff-only reads ─────────────────────────────────────────────────
-- SECURITY DEFINER so it can read dashboard_users regardless of the caller's
-- own RLS. Emails are compared lower-cased: the allowlist was filled by hand
-- in mixed case.
create or replace function public.is_dashboard_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dashboard_users d
     where lower(d.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and d.role in ('operator', 'team')
  );
$$;

revoke all on function public.is_dashboard_staff() from public;
grant execute on function public.is_dashboard_staff() to authenticated;

-- Policies that were USING (true) for every signed-in user.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('executives', 'exec_read'),
      ('activity_posts', 'post_read'),
      ('activity_events', 'event_read'),
      ('fb_message_bank', 'fb_bank_read'),
      ('fb_subtopics', 'fb_subtopics_read'),
      ('fb_messaging_prompts', 'fb_prompts_read'),
      ('fb_posts', 'fb_posts_read'),
      ('fb_post_feedback', 'fb_feedback_read'),
      ('fb_post_metrics', 'fb_metrics_read'),
      ('fb_content_plan', 'fb_content_plan_read'),
      ('fb_settings', 'fb_settings_read'),
      ('fb_page_metrics', 'fb_page_metrics_read'),
      ('scorecard_goals', 'scorecard_goals_read'),
      ('lp_market_scorecard_daily', 'scorecard_daily_read'),
      ('scorecard_goals_monthly', 'scorecard_goals_monthly_read'),
      ('scorecard_goal_distributions', 'scorecard_goal_distributions_read'),
      ('lp_report_facts', 'lp_report_facts_read'),
      ('lp_lead_disposition_rows', 'lp_lead_disposition_rows_read'),
      ('claude_changes', 'claude_changes_read'),
      ('claude_changes_log', 'claude_changes_log_read')
    ) as t(tbl, pol)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('alter policy %I on public.%I using (public.is_dashboard_staff())', p.pol, p.tbl);
    end if;
  end loop;
end $$;

-- Executive Review reads that were open for any non-draft asset.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assets' and policyname = 'asset_read') then
    alter policy asset_read on public.assets using (
      public.is_dashboard_staff()
      and ((status <> 'draft') or (created_by = current_executive_id()))
    );
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'asset_attachments' and policyname = 'attach_read') then
    alter policy attach_read on public.asset_attachments using (
      public.is_dashboard_staff()
      and exists (select 1 from public.assets a
                   where a.id = asset_attachments.asset_id
                     and ((a.status <> 'draft') or (a.created_by = current_executive_id())))
    );
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'asset_approvals' and policyname = 'appr_read') then
    alter policy appr_read on public.asset_approvals using (
      public.is_dashboard_staff()
      and exists (select 1 from public.assets a
                   where a.id = asset_approvals.asset_id
                     and ((a.status <> 'draft') or (a.created_by = current_executive_id())))
    );
  end if;
end $$;

-- Verify (expect 0 rows: no authenticated policy is still USING (true)):
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and roles::text like '%authenticated%' and qual = 'true';
