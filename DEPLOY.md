# Deploying Antifragile Mission Control to Railway

This is the deploy guide for **Railway**. The dashboard is a standard Next.js 16 app, so this could also run on Vercel or Fly with minor tweaks — but Railway is the chosen host because the LP MCP and HL MCP services already live there and benefit from sharing the same project / billing / observability surface.

## Code changes already in this repo

These are required for any container-style host and are already applied — listed here so future maintainers know why they're there:

- **[next.config.ts](next.config.ts) → `output: "standalone"`** — produces a self-contained build that runs in a slim container without dragging `node_modules` along. Reduces image size from ~400 MB to ~150 MB.
- **[package.json](package.json) `start` script → `next start -H 0.0.0.0 -p ${PORT:-3000}`** — binds to all interfaces (not `localhost`, which is unreachable from outside the container) and respects the `PORT` env var that Railway injects at runtime. Falls back to 3000 for local testing.
  - **Windows caveat**: the `${PORT:-3000}` syntax expands in bash/sh but not in cmd. `npm run start` will fail on Windows. Use `npm run dev` locally and let Railway handle production. If you need to test the production build locally on Windows, set `PORT=3000` in your shell first and remove the `${PORT:-3000}` substitution temporarily.

## One-time setup

### 1. Push to GitHub

```bash
git init
git add -A
git commit -m "Phase 1 initial commit"
git branch -M main
git remote add origin https://github.com/mrichard33/antifragile-mission-control.git
git push -u origin main

# Create the dev branch for previews
git checkout -b dev
git push -u origin dev
```

### 2. Create the Railway production service

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → pick `antifragile-mission-control`.
2. Set the deploy **branch to `main`**.
3. Railway auto-detects Next.js. Confirm:
   - **Build command**: `npm run build`
   - **Start command**: `npm run start`
   - **Root directory**: `/`
4. **Add environment variables** in the Variables tab. Copy from `.env.example` and fill in real values:
   - `LP_SUPABASE_URL` / `LP_SUPABASE_ANON_KEY` / `LP_SUPABASE_SERVICE_KEY` / `LP_SUPABASE_PROJECT_ID`
   - `HL_SUPABASE_URL` / `HL_SUPABASE_ANON_KEY` / `HL_SUPABASE_SERVICE_KEY` / `HL_SUPABASE_PROJECT_ID`
   - `NEXT_PUBLIC_LP_SUPABASE_URL` / `NEXT_PUBLIC_LP_SUPABASE_ANON_KEY` (browser-visible mirror)
   - `LP_MCP_URL` / `LP_MCP_AUTH_TOKEN`
   - `HL_MCP_URL` / `HL_MCP_AUTH_TOKEN`
   - `NEXT_PUBLIC_APP_URL` (set to the eventual public URL — see step 4)

### 3. Apply the allowlist migration in LP Supabase

Open the LP Supabase project SQL editor and run [db/migrations/0001_dashboard_users.sql](db/migrations/0001_dashboard_users.sql). **Change the seeded email** from `mark@reecewindows.com` to your real operator email before running.

### 4. Generate a public domain

1. Railway → service → **Settings** → **Networking** → **Generate Domain**.
2. You get something like `antifragile-mission-control-production.up.railway.app`.
3. Set this as `NEXT_PUBLIC_APP_URL` in the service Variables tab and trigger a redeploy (Railway picks up env changes on next deploy).
4. Test the magic-link login flow end-to-end at this URL before adding a custom domain.

### 5. Update Supabase Auth redirect URLs

Supabase dashboard → **Authentication** → **URL Configuration** → **Redirect URLs**. Add every URL the dashboard will be reachable at, each with `/auth/callback` suffix:

```
https://antifragile-mission-control-production.up.railway.app/auth/callback
https://antifragile-mission-control-dev.up.railway.app/auth/callback
https://dashboard.reecewindows.com/auth/callback
http://localhost:3000/auth/callback
```

Without these entries, magic links bounce with a `redirect_uri_mismatch` error.

### 6. Custom domain (optional, do after smoke test)

1. Railway → service → **Settings** → **Networking** → **Custom Domain** → add `dashboard.reecewindows.com`.
2. Railway gives you a CNAME target — add the record at your DNS provider.
3. Once DNS propagates, update `NEXT_PUBLIC_APP_URL` to the custom domain and redeploy.

## Preview environment (`dev` branch)

This preserves the `dev`-first discipline from the Phase 1 plan.

1. In the same Railway project, click **+ New Service** → **GitHub Repo** → same `antifragile-mission-control` repo.
2. Set **branch to `dev`**.
3. Use the same build/start config as production.
4. **Supabase choice**:
   - **Same Supabase as prod**: Simplest. Dev sees production data. Acceptable for Phase 1 because the dashboard is read-only.
   - **Separate Supabase project for dev**: True isolation. Cost: you have to keep the LP / HL schemas in sync between prod and dev. Worth it once the dashboard starts writing data (Phase 4).
5. Set `NEXT_PUBLIC_APP_URL` for the dev service to its own Railway-generated URL.
6. Generate a Railway domain for the dev service (same step as prod).
7. Add the dev `/auth/callback` URL to Supabase's redirect allowlist (covered in step 5 above).

**Workflow once both services exist**:

```
push to dev   → dev service auto-redeploys → smoke test at dev URL
merge to main → prod service auto-redeploys → verify at prod URL
```

## Operational notes

### Cold start

Next.js servers have a non-trivial cold start. On Railway's free/hobby tier the service spins down when idle; the first request after idle can take **10–20 seconds**. If Mark or Chris hits the dashboard sporadically and gets slow first loads, that's why.

**Fixes**:
- **Pro plan (~$5/mo for this service)** keeps it warm. Given that the LP MCP and HL MCP services already need to stay warm, you're probably on Pro already.
- **Uptime ping** every 5 minutes from an external pinger (UptimeRobot, Better Uptime, or a simple `curl` cron) hitting `/api/health` (if you add one) or `/login` (no auth needed).

### Resource sizing

This dashboard at Phase 1 traffic levels needs almost nothing — default Railway allocation is fine. Expect < $5/month at default sizing. Bump RAM only if you see memory pressure later (large Recharts datasets, lots of concurrent users). **Don't pre-optimize.**

### Build logs

If a deploy fails, the most common causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| `MCP base URL missing` at build time | Forgot to set `LP_MCP_URL` / `HL_MCP_URL` in Variables. The MCP clients defer the env check to call-time so this shouldn't happen — but if a future change makes it eager, this is what you'll see. | Add the env vars, redeploy. |
| `LP Supabase env missing` in logs | Same — Supabase env vars not set or typo'd. | Check Variables tab. |
| Magic link 400s in browser | Redirect URL not in Supabase allowlist (step 5). | Add it. |
| Login works in prod but not dev | Dev URL not in Supabase allowlist. | Add it. |
| Build succeeds but pages 500 | Likely a Supabase RLS issue blocking a service-role read, or a schema mismatch between hand-typed `lib/supabase/types.ts` and actual prod schema. | Run `npm run types:generate:lp` / `:hl` to replace hand-typed types with generated ones. |

### Health check

Railway has its own internal health check at the configured port. For a richer check, consider adding `/api/health` later that pings both Supabase instances and both MCP services — useful both for Railway's health check and for the external uptime pinger.

## Rolling back

Railway service → **Deployments** tab → click any previous deployment → **Redeploy**. Takes ~60s. Use this if a deploy breaks production and you need to revert before fixing forward.
