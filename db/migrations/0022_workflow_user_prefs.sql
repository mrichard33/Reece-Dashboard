-- Workflows page — per-user favorites and saved filter presets.
-- Apply in the LP Supabase project (rcjcgjlqzepicbwhnnjl), where dashboard_users lives.
-- Idempotent and additive.
--
-- STATUS: this file was already applied to LP on 2026-09-25, through the
-- Supabase MCP, before the rule "schema changes go through the dashboard
-- only" was set. Nothing else here is pending. To undo it, run
-- 0022_workflow_user_prefs.rollback.sql in the dashboard SQL editor.
--
-- WHY
-- The team asked to star workflows and save filter combinations that follow
-- them to any device (2026-09-25). The dashboard writes only to LP, through
-- server actions (lib/actions/workflowPrefs.ts), so these tables live here and
-- are keyed by the signed-in user's email.
--
-- No FK to dashboard_users on purpose: that allowlist was filled by hand in
-- mixed case, and a preference must never fail to save over a casing mismatch.
-- The app lowercases the email on every read and write. RLS is enabled with no
-- policies, so only the service-role client (the app) can touch the rows —
-- the same discipline as dashboard_users.

create table if not exists public.dashboard_workflow_favorites (
  email            text not null,
  ghl_workflow_id  text not null,
  created_at       timestamptz not null default now(),
  primary key (email, ghl_workflow_id)
);

create table if not exists public.dashboard_workflow_presets (
  id          bigserial primary key,
  email       text not null,
  name        text not null check (char_length(name) between 1 and 60),
  -- WorkflowFilterState v1 (lib/workflows/filters.ts); validated on read too.
  filters     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (email, name)
);

create index if not exists dashboard_workflow_presets_email_idx
  on public.dashboard_workflow_presets (email);

alter table public.dashboard_workflow_favorites enable row level security;
alter table public.dashboard_workflow_presets   enable row level security;

comment on table public.dashboard_workflow_favorites is
  'Starred workflows per dashboard user (lib/actions/workflowPrefs.ts).';
comment on table public.dashboard_workflow_presets is
  'Saved Workflows-page filter states per user; filters = WorkflowFilterState v1.';
