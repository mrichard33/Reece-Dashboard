-- Social Content Engine — Phase 2 foundation: video + Strategist schema (migration 0011).
-- Apply in the LP Supabase project (same project as 0001–0010). Idempotent and additive.
--
-- Completes the schema that 0010 (Phase 1, prompt rows) intentionally deferred:
--   * fb_posts video columns (media_type / video_concept / video_url / video_status)
--   * fb_sync_post_status() extended so a VIDEO post gates on copy + video
--   * fb_post_feedback: add 'video' component; WIDEN reason_code to the full UI set
--     (fixes a pre-existing mismatch — 0003 allowed 9 codes but the dashboard offers 16,
--      so several reject buttons threw a CHECK violation)
--   * fb_settings knobs: video_share / mascot_frequency / animate_still_model
--   * fb_content_plan: Content-Brief storage (brief jsonb + brief_status)
--   * public fb-videos storage bucket + admin policies (mirrors fb-images from 0003)
--
-- NOT in this file (still deferred): live video GENERATION wiring — the WF1 fal
-- animate-still branch, WF3 video regen, and the WF4 Pages /videos publish branch.

-- ─────────────────────────────────────────────────────────────────
-- 1. fb_posts — video component columns
-- ─────────────────────────────────────────────────────────────────
alter table public.fb_posts
  add column if not exists media_type    text not null default 'image',
  add column if not exists video_concept text,
  add column if not exists video_url     text,
  add column if not exists video_status  text;

alter table public.fb_posts drop constraint if exists fb_posts_media_type_check;
alter table public.fb_posts add constraint fb_posts_media_type_check
  check (media_type in ('image','video'));

alter table public.fb_posts drop constraint if exists fb_posts_video_status_check;
alter table public.fb_posts add constraint fb_posts_video_status_check
  check (video_status is null or video_status in ('pending','approved','rejected'));

-- ─────────────────────────────────────────────────────────────────
-- 2. Computed overall status — extend for video posts
-- ─────────────────────────────────────────────────────────────────
-- Image post: approved when copy + image are approved (original behaviour).
-- Video post (media_type='video'): approved when copy + video are approved — the image
-- is the seed frame, not a separate gate. BEFORE trigger mutates NEW (no recursion).
-- The trg_fb_sync_post_status trigger binding from 0003 is unchanged.

create or replace function public.fb_sync_post_status() returns trigger
language plpgsql as $$
declare
  components_ok boolean;
begin
  if new.media_type = 'video' then
    components_ok := (new.copy_status = 'approved' and new.video_status = 'approved');
  else
    components_ok := (new.copy_status = 'approved' and new.image_status = 'approved');
  end if;

  if components_ok and new.status not in ('posted','skipped') then
    new.status := 'approved';
  elsif new.status = 'approved' and not components_ok then
    new.status := 'draft';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. fb_post_feedback — add 'video' component; widen reason_code to the full UI set
-- ─────────────────────────────────────────────────────────────────
alter table public.fb_post_feedback drop constraint if exists fb_post_feedback_component_check;
alter table public.fb_post_feedback add constraint fb_post_feedback_component_check
  check (component in ('copy','image','both','video'));

alter table public.fb_post_feedback drop constraint if exists fb_post_feedback_reason_code_check;
alter table public.fb_post_feedback add constraint fb_post_feedback_reason_code_check
  check (reason_code in (
    -- original 0003 set
    'off-brand','weak-hook','wrong-pillar-fit','compliance-risk','too-salesy',
    'inaccurate','image-mismatch','image-quality','other',
    -- copy/image codes already offered by the dashboard (previously rejected by the CHECK)
    'canon-violation','weak-cta','wrong-scene','looks-ai','wrong-mood',
    'bad-composition','image-artifacts',
    -- new video codes
    'motion-unnatural','video-quality'));

-- ─────────────────────────────────────────────────────────────────
-- 4. fb_settings — video mix knobs (nullable → env/default fallback in getFbTuning)
-- ─────────────────────────────────────────────────────────────────
alter table public.fb_settings
  add column if not exists video_share        int,
  add column if not exists mascot_frequency   int,
  add column if not exists animate_still_model text;

alter table public.fb_settings drop constraint if exists fb_settings_video_share_check;
alter table public.fb_settings add constraint fb_settings_video_share_check
  check (video_share is null or video_share between 0 and 100);

alter table public.fb_settings drop constraint if exists fb_settings_mascot_frequency_check;
alter table public.fb_settings add constraint fb_settings_mascot_frequency_check
  check (mascot_frequency is null or mascot_frequency between 0 and 100);

-- ─────────────────────────────────────────────────────────────────
-- 5. fb_content_plan — Content-Brief storage (the Strategist output lands here)
-- ─────────────────────────────────────────────────────────────────
-- brief holds the strategist prompt's 12-field JSON; brief_status drives dashboard review.
alter table public.fb_content_plan
  add column if not exists brief        jsonb,
  add column if not exists brief_status text not null default 'none';

alter table public.fb_content_plan drop constraint if exists fb_content_plan_brief_status_check;
alter table public.fb_content_plan add constraint fb_content_plan_brief_status_check
  check (brief_status in ('none','draft','approved'));

-- ─────────────────────────────────────────────────────────────────
-- 6. Storage: PUBLIC 'fb-videos' bucket (mirrors fb-images from 0003)
-- ─────────────────────────────────────────────────────────────────
-- Public so Facebook can fetch video_url via the CDN URL. n8n writes via the service role;
-- admins may write manually. No auth-only read policy (public bucket).

insert into storage.buckets (id, name, public)
  values ('fb-videos', 'fb-videos', true)
  on conflict (id) do nothing;

drop policy if exists fb_videos_admin_write on storage.objects;
create policy fb_videos_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'fb-videos' and public.is_admin());
drop policy if exists fb_videos_admin_update on storage.objects;
create policy fb_videos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'fb-videos' and public.is_admin());
drop policy if exists fb_videos_admin_delete on storage.objects;
create policy fb_videos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fb-videos' and public.is_admin());
