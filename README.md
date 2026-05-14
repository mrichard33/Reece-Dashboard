# Antifragile Mission Control

Internal operations dashboard for the **Reece Windows & Doors antifragile sales system**.

Phase 1 build — see [`Phase 1 plan`](../.claude/plans/) for scope and acceptance criteria.

## What it does

Surfaces three things in under 5 seconds:

1. **Is the system healthy?** (services running, syncs current, no contamination)
2. **What's moving through the funnel?** (P1 / P2 / P3 by stage with aging)
3. **What needs attention?** (open issues, contamination, namespace conflicts, stuck contacts, drift)

Two role-gated views from one app:

- **Operator** — full backend visibility: workflows, decision engine, issues, ops logs.
- **Team** — pipeline glance, today's appointments, lead source mix.

Every tile has a small `(i)` button → opens a popover with `{ what, where, fix }` explaining the data and how to remediate. The content lives in [`components/help/helpContent.ts`](components/help/helpContent.ts).

## Stack

- Next.js 16 (App Router, RSC, route handlers) — TypeScript strict
- Tailwind v4 (CSS-first `@theme` in [`app/globals.css`](app/globals.css))
- Supabase (two instances — LP and HL — separate clients, never joined)
- MCP-over-HTTP for live operations (sync triggers, diagnostics, service health)
- Recharts (when needed), TanStack Table v8
- No state library, no ORM, no separate backend.

## Project layout

```
.
├── app/
│   ├── (dashboard)/                # Auth-gated routes (sidebar + topbar shell)
│   │   ├── overview/page.tsx       # Mission Control home
│   │   ├── pipelines/page.tsx
│   │   ├── workflows/page.tsx
│   │   └── issues/page.tsx
│   ├── login/page.tsx              # Email + password sign in
│   ├── login/actions.ts            # Server actions (signIn, requestReset, updatePassword)
│   ├── auth/callback/route.ts      # Supabase code exchange (recovery + future OAuth)
│   ├── auth/reset-password/page.tsx# Set / reset password after email link
│   ├── api/sync/{lp,hl}/route.ts   # Manual sync triggers
│   ├── page.tsx                    # Redirects → /overview
│   └── layout.tsx                  # Root (fonts, theme script)
├── components/
│   ├── ui/                         # Card, Button, Badge, StatusDot, Tooltip, Skeleton
│   ├── shell/                      # Sidebar, TopBar, ThemeToggle, SyncNowButton, RoleGate
│   ├── tiles/                      # StatTile, HealthTile, AlertTile, SyncFreshnessBanner
│   ├── viz/                        # StageBars
│   └── help/                       # InfoPopover + central helpContent registry
├── lib/
│   ├── supabase/                   # LP + HL clients, hand-typed schemas
│   ├── mcp/                        # LP + HL MCP HTTP clients
│   ├── queries/                    # Server-side data fetchers (health, pipelines, workflows, issues)
│   ├── auth.ts                     # getSessionUser, getRole (React.cache-deduped)
│   └── utils.ts                    # cn, relTime, absTime, num, usd
├── db/migrations/                  # SQL Mark applies manually
├── prototype/                      # FROZEN UX reference — not built/served. Don't edit.
├── middleware.ts                   # Auth gate + x-pathname forwarder
├── postcss.config.mjs
├── eslint.config.mjs
├── next.config.ts
└── tsconfig.json
```

## Local setup

Requires **Node 20+** and **npm**.

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local
# Fill: LP_SUPABASE_*, HL_SUPABASE_*, LP_MCP_URL, HL_MCP_URL, *_AUTH_TOKEN

# 3. Apply the allowlist migration in LP Supabase SQL editor:
#    db/migrations/0001_dashboard_users.sql
#    (Edits the seed email — change to your operator email first.)

# 4. (Optional but recommended) Generate full Supabase types:
npm run types:generate:lp  # requires LP_SUPABASE_PROJECT_ID env
npm run types:generate:hl  # requires HL_SUPABASE_PROJECT_ID env
# Output replaces the minimal hand-typed lib/supabase/types.ts

# 5. Run
npm run dev
# http://localhost:3000 — bounces to /login on first visit
```

## Authentication

Sign-in is **email + password** via Supabase Auth, gated by the `dashboard_users`
allowlist. Self-signup is disabled; accounts are provisioned out-of-band.

### Adding a new user

1. In **LP Supabase → Authentication → Users → Add user**: enter the user's
   email and toggle **Send password reset email** ON. (Or supply a temporary
   password if email delivery is unreliable.)
2. Add the email to the allowlist by running this SQL in the LP Supabase
   SQL editor:

   ```sql
   INSERT INTO dashboard_users (email, role)
   VALUES ('new-user@example.com', 'team')
   ON CONFLICT (email) DO UPDATE SET role = 'team';
   ```

   Use role `operator` for full backend access or `team` for the trimmed
   pipeline view.
3. The user clicks the email link, lands on `/auth/reset-password`, sets
   their password, and is redirected to `/overview`.

### Existing users migrating from magic-link

Existing Supabase Auth records still work — they just need to set a password
once. On `/login`, click **First time here? Set a password**, enter the email,
and follow the link in the resulting email.

## Acceptance criteria — Phase 1

- [ ] Email + password login works, allowlist gates non-listed emails
- [ ] `/overview` renders 4 health tiles + 5 stat tiles + activity feed + alerts with real data from both Supabase instances
- [ ] Heartbeat tile flips yellow when latest `agent_events.heartbeat.tick` is > 6 min old
- [ ] `/pipelines` shows P1 / P2 / P3 with correct open opp counts and stage aging
- [ ] `/workflows` lists workflows joined to `workflow_registry`, sorted by canonical code
- [ ] `/issues` shows five sections (open issues, contamination, namespace, drift, stuck contacts) without crashing when any MCP call fails
- [ ] Every tile has a populated `InfoPopover` — zero `TODO` help entries
- [ ] Dark mode toggle persists across reloads
- [ ] `npm run typecheck` and `npm run build` both pass with zero errors

## Known issues to be aware of

Pulled from the system handoff §15:

1. **`workflow_executions` is unpopulated** — HL MCP webhook handler isn't writing to it. `/workflows` "Last execution" column always shows `—` with explanatory popover. Don't try to fix from here.
2. **HL Supabase is a cache, not source of truth.** Every page reading HL data shows a sync-staleness banner when > 2h old.
3. **LP and HL cannot JOIN.** Phase 1 doesn't need this; Phase 3 contact intelligence (`/leads/[id]`) will merge in JS.
4. **Layer 3 Intent Stacking incomplete** — surfaced in Phase 2 on `/agent/rules`.

## Prototype reference

The earlier browser-side React prototype is preserved at [`prototype/`](prototype/). It uses Babel-standalone + Tailwind CDN + mock data and is **not built or served**. It exists as a UX/visual reference: navy + brick palette, sidebar structure, `InfoPopover` with `{ what, where, fix }` triples, `StageBars` design — all carried into this Next.js build.

Do not modify files in `prototype/` — treat it as frozen.

## Deploy

Hosting is **Railway** (same project as the LP MCP and HL MCP services). Full instructions in [DEPLOY.md](DEPLOY.md) — covers the prod service, the `dev` branch preview, Supabase Auth redirect URLs, and the custom domain.

## Roadmap (out of Phase 1 scope)

- **Phase 2**: `/pipelines/[id]`, `/workflows/[id]`, `/workflows/diagnostics`, `/agent/*`, `/leads`
- **Phase 3**: `/leads/[id]` (cross-system merge), `/appointments`, `/ops/*`, realtime subscriptions
- **Phase 4**: wire `/agent/approvals` buttons to the executor, mobile polish, email digest
