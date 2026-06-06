-- Automated Facebook Content Engine — schema, status trigger, RLS, storage, view.
-- Apply in the LP Supabase project (same project as 0001/0002: it holds auth.users +
-- public.executives). Idempotent and additive.
--
-- Reuses the Executive Review identity helpers from 0002 (do NOT redefine them):
--   * public.current_executive_id() — the caller's active executives.id, or null.
--   * public.is_admin()             — true when the caller is an admin executive.
--
-- Model:
--   * Any authenticated user may READ the content tables (Calendar/Insights are visible
--     to operators); only executives may approve/reject/edit; n8n writes via the service
--     role (bypasses RLS). Message Bank + prompt edits are admin-only.
--   * fb_posts.status is COMPUTED by the fb_sync_post_status() BEFORE trigger from the two
--     component statuses; the server action never sets it by hand (except skip/mark-posted).
-- Uses text + CHECK (matching 0002), NOT enums, so hand re-runs stay idempotent.

-- ─────────────────────────────────────────────────────────────────
-- 1. Tables (FK order)
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.fb_message_bank (
  id         uuid primary key default gen_random_uuid(),
  variables  jsonb not null,
  version    int not null default 1,
  segment    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fb_subtopics (
  id               uuid primary key default gen_random_uuid(),
  subtopic         text not null,
  pillar           text not null,
  buyer_stage      text,
  source           text not null default 'seed',
  answers_question text,
  source_evidence  text,
  status           text not null default 'active'
                     check (status in ('proposed','active','inactive','rejected')),
  last_used_at     timestamptz,
  times_used       int not null default 0,
  created_at       timestamptz not null default now(),
  unique (subtopic, pillar)
);

create table if not exists public.fb_messaging_prompts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  body       text not null,
  version    int not null default 1,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table if not exists public.fb_posts (
  id             uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  target         text not null default 'both' check (target in ('group','page','both')),
  pillar         text,
  archetype      text,
  post_body      text,
  first_comment  text,
  image_concept  text,
  image_url      text,
  subtopic_id    uuid references public.fb_subtopics(id),
  copy_status    text not null default 'pending'
                   check (copy_status in ('pending','approved','rejected')),
  image_status   text not null default 'pending'
                   check (image_status in ('pending','approved','rejected')),
  status         text not null default 'draft'
                   check (status in ('draft','approved','posted','skipped')),
  revision       int not null default 0,
  needs_manual   boolean not null default false,
  approved_by    text,   -- executive name snapshot
  posted_by      text,   -- executive name or 'system:page'
  posted_at      timestamptz,
  fb_permalink   text,
  created_at     timestamptz not null default now()
);

create table if not exists public.fb_post_feedback (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.fb_posts(id) on delete cascade,
  component         text not null check (component in ('copy','image','both')),
  reason_code       text not null check (reason_code in
                      ('off-brand','weak-hook','wrong-pillar-fit','compliance-risk',
                       'too-salesy','inaccurate','image-mismatch','image-quality','other')),
  reason_text       text,
  rejected_snapshot text,
  rejected_by       text not null,   -- executive name snapshot
  created_at        timestamptz not null default now()
);

create table if not exists public.fb_post_metrics (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.fb_posts(id) on delete cascade,
  source      text not null check (source in ('page','group')),
  reactions   int default 0,
  comments    int default 0,
  shares      int default 0,
  impressions int default 0,
  reach       int default 0,
  link_clicks int default 0,
  pulled_at   timestamptz not null default now(),
  unique (post_id, source, pulled_at)
);

create index if not exists idx_fb_subtopics_rotation on public.fb_subtopics (status, last_used_at, times_used);
create index if not exists idx_fb_subtopics_pillar   on public.fb_subtopics (pillar);
create index if not exists idx_fb_posts_scheduled     on public.fb_posts (scheduled_date);
create index if not exists idx_fb_posts_status        on public.fb_posts (status);
create index if not exists idx_fb_posts_copy_status   on public.fb_posts (copy_status);
create index if not exists idx_fb_posts_image_status  on public.fb_posts (image_status);
create index if not exists idx_fb_post_feedback_post  on public.fb_post_feedback (post_id);
create index if not exists idx_fb_post_metrics_post   on public.fb_post_metrics (post_id);

-- ─────────────────────────────────────────────────────────────────
-- 2. Computed overall status (both components approved → approved)
-- ─────────────────────────────────────────────────────────────────
-- BEFORE trigger mutates NEW and returns it — no second UPDATE, so no recursion.
-- approved_by / posted_* / revision / needs_manual are set by the server action.

create or replace function public.fb_sync_post_status() returns trigger
language plpgsql as $$
begin
  if new.copy_status = 'approved' and new.image_status = 'approved'
     and new.status not in ('posted','skipped') then
    new.status := 'approved';
  elsif new.status = 'approved'
     and (new.copy_status <> 'approved' or new.image_status <> 'approved') then
    new.status := 'draft';
  end if;
  return new;
end $$;

drop trigger if exists trg_fb_sync_post_status on public.fb_posts;
create trigger trg_fb_sync_post_status
  before insert or update on public.fb_posts
  for each row execute function public.fb_sync_post_status();

-- ─────────────────────────────────────────────────────────────────
-- 3. Engagement view (latest metrics per post + computed rate)
-- ─────────────────────────────────────────────────────────────────
-- Mirrors the v_activity_feed precedent so the dashboard can read aggregates without
-- GROUP BY in supabase-js. LEFT JOIN LATERAL keeps posts with no metrics yet.

create or replace view public.v_fb_post_engagement as
  select
    p.id, p.scheduled_date, p.pillar, p.archetype, p.target, p.status,
    p.post_body, p.posted_at,
    m.source       as metric_source,
    m.reactions, m.comments, m.shares, m.impressions, m.reach, m.link_clicks,
    m.pulled_at,
    (coalesce(m.reactions,0) + coalesce(m.comments,0) + coalesce(m.shares,0))::numeric
      / nullif(m.reach, 0) as engagement_rate
  from public.fb_posts p
  left join lateral (
    select * from public.fb_post_metrics fm
     where fm.post_id = p.id
     order by fm.pulled_at desc
     limit 1
  ) m on true;

-- ─────────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────

alter table public.fb_message_bank     enable row level security;
alter table public.fb_subtopics        enable row level security;
alter table public.fb_messaging_prompts enable row level security;
alter table public.fb_posts            enable row level security;
alter table public.fb_post_feedback    enable row level security;
alter table public.fb_post_metrics     enable row level security;

-- Reads: any authenticated user (operators see Calendar/Insights). Writes per role below.
drop policy if exists fb_bank_read on public.fb_message_bank;
create policy fb_bank_read on public.fb_message_bank for select to authenticated using (true);
drop policy if exists fb_bank_admin_write on public.fb_message_bank;
create policy fb_bank_admin_write on public.fb_message_bank for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fb_subtopics_read on public.fb_subtopics;
create policy fb_subtopics_read on public.fb_subtopics for select to authenticated using (true);
drop policy if exists fb_subtopics_exec_write on public.fb_subtopics;
create policy fb_subtopics_exec_write on public.fb_subtopics for all to authenticated
  using (public.current_executive_id() is not null)
  with check (public.current_executive_id() is not null);

drop policy if exists fb_prompts_read on public.fb_messaging_prompts;
create policy fb_prompts_read on public.fb_messaging_prompts for select to authenticated using (true);
drop policy if exists fb_prompts_admin_write on public.fb_messaging_prompts;
create policy fb_prompts_admin_write on public.fb_messaging_prompts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Posts: read all; executives may UPDATE (approve/reject/edit/skip/mark-posted).
-- INSERT/DELETE only via service role (n8n) — no authenticated policy for those.
drop policy if exists fb_posts_read on public.fb_posts;
create policy fb_posts_read on public.fb_posts for select to authenticated using (true);
drop policy if exists fb_posts_exec_update on public.fb_posts;
create policy fb_posts_exec_update on public.fb_posts for update to authenticated
  using (public.current_executive_id() is not null)
  with check (public.current_executive_id() is not null);

-- Feedback: read all; executives may INSERT (rejection log; Dashboard is system of record).
drop policy if exists fb_feedback_read on public.fb_post_feedback;
create policy fb_feedback_read on public.fb_post_feedback for select to authenticated using (true);
drop policy if exists fb_feedback_exec_insert on public.fb_post_feedback;
create policy fb_feedback_exec_insert on public.fb_post_feedback for insert to authenticated
  with check (public.current_executive_id() is not null);

-- Metrics: read all; executives may INSERT only manual Group numbers. Page metrics are
-- written by n8n via the service role.
drop policy if exists fb_metrics_read on public.fb_post_metrics;
create policy fb_metrics_read on public.fb_post_metrics for select to authenticated using (true);
drop policy if exists fb_metrics_exec_group_insert on public.fb_post_metrics;
create policy fb_metrics_exec_group_insert on public.fb_post_metrics for insert to authenticated
  with check (public.current_executive_id() is not null and source = 'group');

-- ─────────────────────────────────────────────────────────────────
-- 5. Storage: PUBLIC 'fb-images' bucket
-- ─────────────────────────────────────────────────────────────────
-- Public (unlike asset-media) so Facebook can fetch image_url via the CDN URL. n8n writes
-- via the service role; admins may write manually. No auth-only read policy (public bucket).

insert into storage.buckets (id, name, public)
  values ('fb-images', 'fb-images', true)
  on conflict (id) do nothing;

drop policy if exists fb_images_admin_write on storage.objects;
create policy fb_images_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'fb-images' and public.is_admin());
drop policy if exists fb_images_admin_update on storage.objects;
create policy fb_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'fb-images' and public.is_admin());
drop policy if exists fb_images_admin_delete on storage.objects;
create policy fb_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fb-images' and public.is_admin());
