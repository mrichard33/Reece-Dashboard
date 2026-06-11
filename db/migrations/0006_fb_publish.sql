-- FB Page auto-publish: connection settings, service-role-only secrets,
-- publish-state columns, and the target='both' two-leg resolution.
-- Apply in the LP Supabase project (same as 0003). Idempotent and additive.
--
-- Reuses the Executive Review identity helper from 0002 (do NOT redefine it):
--   * public.is_admin() — true when the caller is an admin executive.
--
-- Model:
--   * fb_settings  — single-row, non-secret connection config. Authenticated READ
--     (the Settings page and Content UI may show connection state); ADMIN write.
--   * fb_secrets   — key/value secrets (the FB Page access token). RLS enabled with
--     NO authenticated policies: only the service role (dashboard server actions,
--     n8n) can read or write. The token never reaches the browser.
--   * fb_posts     — page-leg state columns. For target='page' the Page leg flips
--     status to 'posted'. For target='both' the row STAYS 'approved' after the Page
--     leg (page_posted_at records it); the human Group leg via markPosted() flips
--     overall status. This resolves the WF4 sticky-note decision.

-- ── 1. Settings (non-secret) ─────────────────────────────────────
create table if not exists public.fb_settings (
  id                    int primary key default 1 check (id = 1),  -- single row
  fb_page_id            text,
  fb_graph_version      text not null default 'v23.0',
  auto_publish_enabled  boolean not null default false,            -- master kill switch
  fb_page_name          text,                                      -- snapshot from Test Connection
  token_last4           text,                                      -- display-only hint, never the token
  token_updated_at      timestamptz,
  updated_by            text,
  updated_at            timestamptz not null default now()
);

insert into public.fb_settings (id) values (1) on conflict (id) do nothing;

alter table public.fb_settings enable row level security;

drop policy if exists fb_settings_read on public.fb_settings;
create policy fb_settings_read on public.fb_settings
  for select to authenticated using (true);

drop policy if exists fb_settings_admin_write on public.fb_settings;
create policy fb_settings_admin_write on public.fb_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 2. Secrets (service-role only) ───────────────────────────────
create table if not exists public.fb_secrets (
  key        text primary key,
  value      text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.fb_secrets enable row level security;
-- Intentionally NO policies: authenticated role gets nothing; service role bypasses RLS.

-- ── 3. fb_posts publish-state columns ────────────────────────────
alter table public.fb_posts add column if not exists page_posted_at     timestamptz;
alter table public.fb_posts add column if not exists page_permalink     text;
alter table public.fb_posts add column if not exists publish_attempts   int not null default 0;
alter table public.fb_posts add column if not exists last_publish_error text;

-- ── 4. Time-of-day post controller ───────────────────────────────
-- scheduled_time is the executive-chosen Eastern wall-clock time for the post.
-- NULL = publish on approval (the pre-existing behavior). publish_at is the
-- derived UTC instant WF4 gates on; a BEFORE trigger keeps it in sync whenever
-- scheduled_date OR scheduled_time changes (so reschedulePost moving the date
-- automatically moves the publish instant too). 'America/New_York' in the tz
-- database handles DST correctly — never hardcode an offset.
alter table public.fb_posts add column if not exists scheduled_time time;
alter table public.fb_posts add column if not exists publish_at     timestamptz;

create or replace function public.fb_set_publish_at() returns trigger
language plpgsql as $$
begin
  if new.scheduled_time is null then
    new.publish_at := null;   -- null = eligible the moment it's approved
  else
    new.publish_at := (new.scheduled_date::timestamp + new.scheduled_time)
                        at time zone 'America/New_York';
  end if;
  return new;
end $$;

drop trigger if exists trg_fb_set_publish_at on public.fb_posts;
create trigger trg_fb_set_publish_at
  before insert or update of scheduled_date, scheduled_time on public.fb_posts
  for each row execute function public.fb_set_publish_at();

create index if not exists idx_fb_posts_page_publish
  on public.fb_posts (status, target, page_posted_at)
  where page_posted_at is null;
