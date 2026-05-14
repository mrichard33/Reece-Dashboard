-- Apply this in the LP Supabase project (Mark applies manually via SQL editor).
-- The dashboard reads this table to gate access by email + role.

create table if not exists public.dashboard_users (
  email      text primary key,
  role       text not null check (role in ('operator', 'team')),
  created_at timestamptz not null default now()
);

comment on table public.dashboard_users is
  'Allowlist for the Antifragile Mission Control dashboard. operator = full backend access; team = pipeline/leads only.';

-- Seed the operator. Replace with Mark''s email if different.
insert into public.dashboard_users (email, role) values
  ('mark@reecewindows.com', 'operator')
on conflict (email) do nothing;

-- Service role bypasses RLS by default. We keep RLS off for this table since
-- it's only read by getSessionUser() via the service client.
-- If RLS is enabled elsewhere, add:
--   alter table public.dashboard_users enable row level security;
--   create policy "service role can read" on public.dashboard_users
--     for select to service_role using (true);
