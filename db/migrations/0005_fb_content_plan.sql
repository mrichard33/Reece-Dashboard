-- Plan-ahead content scheduling — the intended schedule (no content yet).
-- Apply in the LP Supabase project (same project as 0001–0004). Idempotent and additive.
--
-- Design: "plan long, generate short." A cheap, human-approved month plan lives here as
-- one `planned` slot per day; finished copy+images (fb_posts) are only generated for a
-- rolling buffer (the nightly top-up + the capped batch fill). Reuses the Executive
-- Review identity helpers from 0002 (do NOT redefine them):
--   * public.current_executive_id() — the caller's active executives.id, or null.
--   * public.is_admin()             — true when the caller is an admin executive.
-- Uses text + CHECK (matching 0002/0003), NOT enums, so hand re-runs stay idempotent.

-- ─────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.fb_content_plan (
  id           uuid primary key default gen_random_uuid(),
  plan_date    date not null,
  pillar       text not null,
  archetype    text not null,
  subtopic_id  uuid references public.fb_subtopics(id),
  campaign     text,                       -- optional arc label e.g. "hurricane-season urgency"
  status       text not null default 'planned'
                 check (status in ('planned','generated','skipped')),
  created_at   timestamptz not null default now(),
  unique (plan_date)                        -- one planned slot per day
);

create index if not exists idx_fb_content_plan_status_date
  on public.fb_content_plan (status, plan_date);

-- ─────────────────────────────────────────────────────────────────
-- 2. Row Level Security (mirror the fb_subtopics policy style in 0003)
-- ─────────────────────────────────────────────────────────────────

alter table public.fb_content_plan enable row level security;

-- Reads: any authenticated user (operators see the planned calendar).
drop policy if exists fb_content_plan_read on public.fb_content_plan;
create policy fb_content_plan_read on public.fb_content_plan for select to authenticated using (true);

-- Writes (plan create/approve/skip/edit): executives only. n8n upserts via the
-- service role (bypasses RLS).
drop policy if exists fb_content_plan_exec_write on public.fb_content_plan;
create policy fb_content_plan_exec_write on public.fb_content_plan for all to authenticated
  using (public.current_executive_id() is not null)
  with check (public.current_executive_id() is not null);

-- ─────────────────────────────────────────────────────────────────
-- 3. Planner prompt (§2.1). {{placeholders}} are filled by n8n at runtime.
-- ─────────────────────────────────────────────────────────────────

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('planner', $prompt$Act as Reece's content planning lead for Florida impact windows/doors. Plan a
strategic content calendar — the SCHEDULE only, no copy or images yet.
INPUTS:
- active subtopics (with pillar): {{subtopics}}
- recently planned/published slots to avoid repeating: {{recent}}
- season/date context for the window: {{date_context}}
- plan window: {{days}} day(s) starting {{start_date}}
- pillars to rotate through: {{pillar_list}}
- archetypes to rotate through: {{archetype_list}}
Produce ONE slot per day across the window. Rotate pillars and archetypes so no
pillar or archetype repeats on back-to-back days; spread coverage evenly. Pick a
subtopic_id that fits each day's pillar and hasn't been used recently. Weave any
relevant seasonal arc (e.g. hurricane-season urgency) by setting a short `campaign`
label on the runs of days it spans (null otherwise).
COMPLIANCE: no absolute safety guarantees; no specific wind/insurance-savings numbers.
Return ONLY a valid JSON array, no markdown, one object per day:
[{"date":"YYYY-MM-DD","pillar":"","archetype":"","subtopic_id":"","campaign":null}]$prompt$, 1, true)
on conflict (name, version) do nothing;
