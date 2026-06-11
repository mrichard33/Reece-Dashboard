-- Settings restructure: UI-managed generation tuning (replaces env knobs with
-- DB values + env fallback), default post time, and DB-managed approver flags.
-- Apply in the LP Supabase project. Idempotent and additive.

-- ── 1. Content-engine tuning on fb_settings (null = fall back to env/default) ──
alter table public.fb_settings add column if not exists default_post_time       time;
alter table public.fb_settings add column if not exists max_regen_attempts      int  check (max_regen_attempts      between 1 and 10);
alter table public.fb_settings add column if not exists max_per_generation      int  check (max_per_generation      between 1 and 20);
alter table public.fb_settings add column if not exists plan_horizon_days       int  check (plan_horizon_days       between 1 and 90);
alter table public.fb_settings add column if not exists generation_buffer_days  int  check (generation_buffer_days  between 1 and 30);

-- ── 2. default_post_time participates in publish_at derivation ───────────────
-- Per-post scheduled_time wins; else the settings default; else NULL (= publish
-- on approval). The default applies when a row is inserted or its date/time is
-- edited — changing the setting does NOT retro-update existing rows (deliberate:
-- already-reviewed schedules shouldn't move under the approvers' feet).
create or replace function public.fb_set_publish_at() returns trigger
language plpgsql as $$
declare
  v_default time;
begin
  if new.scheduled_time is null then
    select default_post_time into v_default from public.fb_settings where id = 1;
    if v_default is null then
      new.publish_at := null;
    else
      new.publish_at := (new.scheduled_date::timestamp + v_default)
                          at time zone 'America/New_York';
    end if;
  else
    new.publish_at := (new.scheduled_date::timestamp + new.scheduled_time)
                        at time zone 'America/New_York';
  end if;
  return new;
end $$;
-- (trigger trg_fb_set_publish_at from 0006 already points at this function)

-- ── 3. DB-managed approver flag on executives ────────────────────────────────
alter table public.executives add column if not exists is_approver boolean not null default false;
