-- Command Center — the Changes lane.
-- Apply in the LP Supabase project (same as 0003). Idempotent and additive.
--
-- WHY THIS EXISTS
-- build_needed items are written and never read. They are excluded from
-- v_command_center_queue (LP-MCP sql/102:300) and appear in no lane at all. As of
-- 2026-09-13 that is 344 filed since March, 198 still open — six months of
-- captured work nobody can see.
--
-- WHERE THEY ACTUALLY COME FROM (checked, not assumed)
-- Not from Command Center rulings. claude_rule_apply is the only writer of
-- ref='decision:<id>' and it has run once, on a ruling that filed no build. All
-- 198 open items have source_field 'live' or 'pending_items' — they were captured
-- by memory_checkpoint during working sessions, and 0 of them carry a decision
-- ref. Their `ref` is free text: a GHL workflow name, a UUID, a canonical code.
--
-- So decision_id is null for the whole backfill, and the lane must render an
-- unlinked change honestly rather than showing an empty evidence panel. Changes
-- created from a ruling DO carry the full chain; both shapes are real.
--
-- claude_changes is the implementation record for those items: what is being
-- built, the prompt to build it with, and how far it has got. Memory
-- (claude_decision_log) stays the record of what was DECIDED; this is the record
-- of what was DONE about it. Keeping them apart is deliberate — a decision is
-- permanent, an implementation attempt is not.
--
-- STATUS IS DERIVED, NEVER WRITTEN.
-- Callers write facts (approved_at, pr_number, ci_conclusion, merged_at); the
-- BEFORE trigger computes `status` from them. Same discipline as
-- fb_sync_post_status() in 0003/0014 — the one thing that stopped the content
-- engine's statuses drifting from reality. Any write to status is overwritten.

-- ── 1. The change record ─────────────────────────────────────────
create table if not exists public.claude_changes (
  id              bigserial primary key,

  -- What it came from. No FKs: claude_* lives in LP-MCP's migration lineage and
  -- a dangling reference must never block writing a change.
  decision_id     integer,
  build_item_id   integer unique,   -- unique: one change per build item, so the
                                    -- backfill and the live path cannot double-file

  -- Which kind of change this is. These three behave completely differently and
  -- the prompt differs per lane, so it is chosen, not assumed.
  --   code         → a PR against one of the repos
  --   agent_rule   → a row in agent_rules, applied as SQL, no GitHub involved
  --   ghl_workflow → instructions only; GHL edits stay manual in the UI
  lane            text check (lane in ('code','agent_rule','ghl_workflow')),
  repo            text check (repo in ('lp','dashboard','hl','n8n','ghl-workflows')),

  title           text not null,
  summary         text,

  -- The generated prompt, and how many times it has been regenerated.
  prompt_text     text,
  prompt_version  int not null default 0,

  -- Facts. The trigger reads these; nothing else should be inferred from status.
  approved_at     timestamptz,
  approved_by     text,
  rejected_at     timestamptz,
  rejected_by     text,
  reject_reason   text,
  pr_number       int,
  pr_url          text,
  ci_conclusion   text,   -- success | failure | timed_out | cancelled | null=pending
  merged_at       timestamptz,
  deployed_at     timestamptz,
  rolled_back_at  timestamptz,
  failure_reason  text,

  -- Attempt cap. Copies the content engine's soft stop: at the cap the row flags
  -- for manual authoring rather than locking (see 0003 + lib/actions/content.ts).
  attempts        int not null default 0,
  needs_manual    boolean not null default false,

  status          text not null default 'proposed',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_claude_changes_status  on public.claude_changes (status, created_at desc);
create index if not exists idx_claude_changes_decision on public.claude_changes (decision_id);

-- ── 2. Status derivation ─────────────────────────────────────────
-- Order matters: the terminal and off-ramp states are tested before the happy
-- path, so a rolled-back change never reads as deployed and a red CI never reads
-- as in_review.
create or replace function public.claude_changes_sync_status()
returns trigger language plpgsql as $$
begin
  new.status :=
    case
      when new.rolled_back_at is not null                    then 'rolled_back'
      when new.rejected_at    is not null                    then 'rejected'
      when new.merged_at      is not null                    then 'deployed'
      when new.failure_reason is not null
        or new.ci_conclusion in ('failure','timed_out','cancelled')
                                                             then 'failed'
      -- A PR exists: CI decides whether it is still being tested or is sitting
      -- waiting on a human to merge it.
      when new.pr_number is not null and new.ci_conclusion = 'success'
                                                             then 'in_review'
      when new.pr_number is not null                         then 'testing'
      when new.approved_at is not null                       then 'approved'
      else                                                        'proposed'
    end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_claude_changes_sync_status on public.claude_changes;
create trigger trg_claude_changes_sync_status
  before insert or update on public.claude_changes
  for each row execute function public.claude_changes_sync_status();

-- ── 3. Audit log ─────────────────────────────────────────────────
-- Append-only. One row per transition, carrying the prompt as it stood, so
-- "what were we asked to build, and what did it become" is answerable later.
create table if not exists public.claude_changes_log (
  id            bigserial primary key,
  change_id     bigint not null references public.claude_changes(id) on delete cascade,
  at            timestamptz not null default now(),
  actor         text not null,
  action        text not null,   -- generated | approved | rejected | pr_linked | ci | merged | rolled_back | edited
  from_status   text,
  to_status     text,
  reason        text,
  prompt_snapshot text
);

create index if not exists idx_claude_changes_log_change on public.claude_changes_log (change_id, at desc);

-- Deletes and updates are refused outright: an audit trail you can edit is not
-- one. Mirrors claude_rulings_log_append_only() in LP-MCP sql/102:168.
create or replace function public.claude_changes_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'claude_changes_log is append-only (attempted %)', tg_op;
end;
$$;

drop trigger if exists trg_claude_changes_log_append_only on public.claude_changes_log;
create trigger trg_claude_changes_log_append_only
  before update or delete on public.claude_changes_log
  for each row execute function public.claude_changes_log_append_only();

-- ── 4. RLS ───────────────────────────────────────────────────────
-- Read for any authenticated user; writes are service-role only, because every
-- write goes through a dashboard server action that re-checks the admin gate
-- itself (lib/actions/commandCenter.ts). No authenticated write policy exists,
-- so a browser cannot move a change's state directly.
alter table public.claude_changes     enable row level security;
alter table public.claude_changes_log enable row level security;

drop policy if exists claude_changes_read on public.claude_changes;
create policy claude_changes_read on public.claude_changes
  for select to authenticated using (true);

drop policy if exists claude_changes_log_read on public.claude_changes_log;
create policy claude_changes_log_read on public.claude_changes_log
  for select to authenticated using (true);

-- ── 5. Backfill the buried work ──────────────────────────────────
-- One change per OPEN build_needed item. Re-runnable: build_item_id is unique,
-- so a second run adds only what is new. The decision join is left join on
-- purpose and resolves to null for every existing row (see above) — it is there
-- for changes filed by a ruling from here on, not for the backfill.
--
-- `lane` here is a GUESS from the item's own words, not a classification — the
-- UI lets you change it, and the prompt is not generated until a lane is set.
-- A wrong guess you can see beats a null you have to fill in 198 times.
insert into public.claude_changes (decision_id, build_item_id, lane, title, summary, created_at)
select
  d.id,
  p.id,
  case
    when p.description ~* '(agent_rule|agent rule|rule_key|decision engine rule)' then 'agent_rule'
    when p.description ~* '(ghl|gohighlevel|workflow [A-Z]\.|\m[A-Z]\d?\.\d)'     then 'ghl_workflow'
    else 'code'
  end,
  left(p.description, 300),
  p.description,
  p.created_at
from public.claude_pending_items p
left join public.claude_decision_log d on 'decision:' || d.id = p.ref
where p.item_type = 'build_needed'
  and p.status = 'open'
on conflict (build_item_id) do nothing;
