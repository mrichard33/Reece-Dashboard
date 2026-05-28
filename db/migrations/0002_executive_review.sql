-- Executive Review & Showcase — schema, integrity layer, RLS, storage.
-- Apply in the LP Supabase project (same project as 0001_dashboard_users.sql:
-- it holds auth.users + dashboard_users). Idempotent and additive.
--
-- Integrity model (see functions + triggers below):
--   * Only the admin (executives.is_admin) may set asset_approvals.required.
--   * Only the owning executive may cast their own decision/reason.
--   * Master asset.status is COMPUTED from required approvals, never set by hand.
-- RLS is row-level; the column-guard trigger enforces *which column* each role
-- may change. Both must be in force for the model to hold.

-- ─────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.executives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  name        text not null,
  email       text not null unique,
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.assets (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  asset_type   text not null check (asset_type in
                 ('script','audio','video','framework','transcript','system_change','other')),
  description  text,
  status       text not null default 'draft' check (status in
                 ('draft','in_review','approved','changes_requested')),
  created_by   uuid not null references public.executives(id),
  submitted_at timestamptz,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.asset_attachments (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.assets(id) on delete cascade,
  kind         text not null check (kind in ('file','link','text')),
  label        text not null,
  storage_path text,
  external_url text,
  inline_text  text,
  media_type   text check (media_type in ('audio','video','pdf','doc','other')),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.asset_approvals (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.assets(id) on delete cascade,
  executive_id uuid not null references public.executives(id),
  required     boolean not null default false,
  decision     text not null default 'pending'
                 check (decision in ('pending','approved','rejected')),
  reason       text,
  decided_at   timestamptz,
  unique (asset_id, executive_id)
);

create table if not exists public.activity_events (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  actor_id     uuid references public.executives(id),
  asset_id     uuid references public.assets(id) on delete cascade,
  summary      text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.activity_posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.executives(id),
  body       text not null,
  category   text check (category in ('content','automation','funnel','other')),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.executives(id),
  type         text not null,
  asset_id     uuid references public.assets(id) on delete cascade,
  body         text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_asset_approvals_asset on public.asset_approvals(asset_id);
create index if not exists idx_asset_attachments_asset on public.asset_attachments(asset_id);
create index if not exists idx_activity_events_created on public.activity_events(created_at desc);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id, read);

-- ─────────────────────────────────────────────────────────────────
-- 2. Unified feed view
-- ─────────────────────────────────────────────────────────────────

create or replace view public.v_activity_feed as
  select 'event'::text as source, e.id, e.summary as body, e.actor_id, e.asset_id,
         null::text as category, e.created_at
    from public.activity_events e
  union all
  select 'post'::text as source, p.id, p.body, p.author_id as actor_id, null::uuid as asset_id,
         p.category, p.created_at
    from public.activity_posts p;

-- ─────────────────────────────────────────────────────────────────
-- 3. Identity helpers (security definer — resolve the caller's executive)
-- ─────────────────────────────────────────────────────────────────

create or replace function public.current_executive_id()
returns uuid language sql stable security definer as $$
  select id from public.executives where user_id = auth.uid() and active = true limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select coalesce((select is_admin from public.executives
                   where user_id = auth.uid() and active = true limit 1), false);
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Column-guard trigger on asset_approvals (the integrity core)
-- ─────────────────────────────────────────────────────────────────

create or replace function public.guard_asset_approval_update()
returns trigger language plpgsql security definer as $$
declare me uuid := public.current_executive_id();
begin
  if (new.required is distinct from old.required) and not public.is_admin() then
    raise exception 'Only an admin may set required approvers';
  end if;

  if (new.decision is distinct from old.decision
      or new.reason is distinct from old.reason) then
    if new.executive_id <> me then
      raise exception 'You may only cast your own decision';
    end if;
    if new.decision = 'rejected' and coalesce(btrim(new.reason),'') = '' then
      raise exception 'A rejection requires a reason';
    end if;
    new.decided_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_asset_approval on public.asset_approvals;
create trigger trg_guard_asset_approval
  before update on public.asset_approvals
  for each row execute function public.guard_asset_approval_update();

-- ─────────────────────────────────────────────────────────────────
-- 5. Computed master status + auto feed/notifications
-- ─────────────────────────────────────────────────────────────────

create or replace function public.recompute_asset_status()
returns trigger language plpgsql security definer as $$
declare
  a            public.assets%rowtype;
  req_total    int;
  req_approved int;
  req_rejected int;
  new_status   text;
begin
  select * into a from public.assets where id = new.asset_id;
  if a.status = 'draft' then return new; end if;

  select count(*) filter (where required),
         count(*) filter (where required and decision = 'approved'),
         count(*) filter (where required and decision = 'rejected')
    into req_total, req_approved, req_rejected
    from public.asset_approvals where asset_id = new.asset_id;

  if req_rejected > 0 then
    new_status := 'changes_requested';
  elsif req_total > 0 and req_approved = req_total then
    new_status := 'approved';
  else
    new_status := 'in_review';
  end if;

  if new_status is distinct from a.status then
    update public.assets
       set status = new_status,
           approved_at = case when new_status = 'approved' then now() else null end,
           updated_at = now()
     where id = a.id;

    if new_status = 'approved' then
      insert into public.activity_events(event_type, actor_id, asset_id, summary)
        values ('asset_approved', new.executive_id, a.id,
                format('%s was fully approved', a.title));
    elsif new_status = 'changes_requested' then
      insert into public.activity_events(event_type, actor_id, asset_id, summary)
        values ('asset_changes_requested', new.executive_id, a.id,
                format('Changes requested on %s', a.title));
    end if;
  end if;

  if (tg_op = 'UPDATE') and (new.decision is distinct from old.decision)
     and new.decision <> 'pending' then
    insert into public.activity_events(event_type, actor_id, asset_id, summary)
      select 'decision_cast', new.executive_id, a.id,
             format('%s %s %s',
                    (select name from public.executives where id = new.executive_id),
                    case when new.decision = 'approved' then 'approved' else 'requested changes on' end,
                    a.title);

    insert into public.notifications(recipient_id, type, asset_id, body)
      select ex.id, 'decision_cast', a.id,
             format('%s %s "%s"',
                    (select name from public.executives where id = new.executive_id),
                    case when new.decision='approved' then 'approved' else 'requested changes on' end,
                    a.title)
        from public.executives ex where ex.is_admin = true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_recompute_status on public.asset_approvals;
create trigger trg_recompute_status
  after update on public.asset_approvals
  for each row execute function public.recompute_asset_status();

-- ─────────────────────────────────────────────────────────────────
-- 6. Submit + revision-reset RPCs
-- ─────────────────────────────────────────────────────────────────

-- Submit a draft for review: flip status, emit feed event, and (since
-- notifications has no INSERT RLS policy) write the approval_requested rows
-- here under security definer.
create or replace function public.submit_asset(p_asset_id uuid)
returns void language plpgsql security definer as $$
declare
  a         public.assets%rowtype;
  me        uuid := public.current_executive_id();
  submitter text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.assets
     set status='in_review', submitted_at=now(), updated_at=now()
   where id=p_asset_id and status='draft';

  select * into a from public.assets where id=p_asset_id;
  select name into submitter from public.executives where id = me;

  insert into public.activity_events(event_type, actor_id, asset_id, summary)
    values ('asset_submitted', me, a.id,
            format('%s submitted %s for review', coalesce(submitter, 'Someone'), a.title));

  insert into public.notifications(recipient_id, type, asset_id, body)
    select aa.executive_id, 'approval_requested', a.id,
           format('Approval needed: %s', a.title)
      from public.asset_approvals aa
     where aa.asset_id = p_asset_id and aa.required;
end; $$;

-- Revision reset: 'material' resets ALL required approvals; 'minor' resets
-- only those who rejected. The recompute trigger pulls status back to in_review.
create or replace function public.reset_approvals(p_asset_id uuid, p_mode text)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_mode = 'material' then
    update public.asset_approvals
       set decision='pending', reason=null, decided_at=null
     where asset_id=p_asset_id and required;
  elsif p_mode = 'minor' then
    update public.asset_approvals
       set decision='pending', reason=null, decided_at=null
     where asset_id=p_asset_id and required and decision='rejected';
  else
    raise exception 'mode must be material or minor';
  end if;
end; $$;

-- ─────────────────────────────────────────────────────────────────
-- 7. Row Level Security
-- ─────────────────────────────────────────────────────────────────

alter table public.executives        enable row level security;
alter table public.assets            enable row level security;
alter table public.asset_attachments enable row level security;
alter table public.asset_approvals   enable row level security;
alter table public.activity_events   enable row level security;
alter table public.activity_posts    enable row level security;
alter table public.notifications     enable row level security;

-- executives: everyone authenticated reads the roster; writes via service role only.
drop policy if exists exec_read on public.executives;
create policy exec_read on public.executives for select to authenticated using (true);

-- assets: drafts visible to creator only; everything else to all execs. Admin writes.
drop policy if exists asset_read on public.assets;
create policy asset_read on public.assets for select to authenticated
  using (status <> 'draft' or created_by = public.current_executive_id());
drop policy if exists asset_write on public.assets;
create policy asset_write on public.assets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- attachments: follow the parent asset's visibility; admin writes.
drop policy if exists attach_read on public.asset_attachments;
create policy attach_read on public.asset_attachments for select to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_id
                 and (a.status <> 'draft' or a.created_by = public.current_executive_id())));
drop policy if exists attach_write on public.asset_attachments;
create policy attach_write on public.asset_attachments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- approvals: read all rows on visible assets (transparency); admin seeds/toggles
-- required; an exec may update only their own row (column-guard trigger further
-- restricts which columns).
drop policy if exists appr_read on public.asset_approvals;
create policy appr_read on public.asset_approvals for select to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_id
                 and (a.status <> 'draft' or a.created_by = public.current_executive_id())));
drop policy if exists appr_admin_write on public.asset_approvals;
create policy appr_admin_write on public.asset_approvals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists appr_self_update on public.asset_approvals;
create policy appr_self_update on public.asset_approvals for update to authenticated
  using (executive_id = public.current_executive_id())
  with check (executive_id = public.current_executive_id());

-- activity posts: all read; an exec may insert only as themselves.
drop policy if exists post_read on public.activity_posts;
create policy post_read on public.activity_posts for select to authenticated using (true);
drop policy if exists post_write on public.activity_posts;
create policy post_write on public.activity_posts for insert to authenticated
  with check (author_id = public.current_executive_id());

-- activity events: all read; inserts come only from security-definer triggers.
drop policy if exists event_read on public.activity_events;
create policy event_read on public.activity_events for select to authenticated using (true);

-- notifications: an exec reads + marks read only their own.
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
  using (recipient_id = public.current_executive_id());
drop policy if exists notif_mark on public.notifications;
create policy notif_mark on public.notifications for update to authenticated
  using (recipient_id = public.current_executive_id())
  with check (recipient_id = public.current_executive_id());

-- ─────────────────────────────────────────────────────────────────
-- 8. Storage: private 'asset-media' bucket
-- ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
  values ('asset-media', 'asset-media', false)
  on conflict (id) do nothing;

drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-media' and public.is_admin());
drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'asset-media' and public.is_admin());
drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'asset-media' and public.is_admin());
drop policy if exists media_auth_read on storage.objects;
create policy media_auth_read on storage.objects for select to authenticated
  using (bucket_id = 'asset-media');
