# n8n workflows — Reece Automated Facebook Post Engine

Seven importable workflow definitions for the content engine's orchestration layer.
They are committed as **artifacts**: import each JSON into n8n, attach credentials,
replace the placeholder tokens, then activate. They are inert until then — the
Dashboard's Content area runs fully without them (the webhook triggers no-op when
`N8N_BASE_URL` / `N8N_WEBHOOK_SECRET` are unset).

> All data lives in the **LP Supabase** project (same project as the Dashboard's
> `executives`/`fb_*` tables). n8n connects with the LP **service role** key, which
> bypasses RLS. Apply `db/migrations/0003_fb_content_engine.sql` and
> `0004_fb_seed.sql` first.

## Workflows

| File | Name | Trigger(s) | Schedule |
|---|---|---|---|
| `fb-nightly-generator.json` | FB · Nightly Generator (WF1) | schedule + webhook `fb-generate-now` | `0 6 * * *` ET |
| `fb-weekly-miner.json` | FB · Weekly Idea Miner (WF2) | schedule + webhook `fb-run-miner` | `0 7 * * 1` |
| `fb-regeneration-webhook.json` | FB · Regeneration Webhook (WF3) | webhook `fb-regenerate` | — |
| `fb-page-publish.json` | FB · Page Publish (WF4) | schedule | `*/2 * * * *` |
| `fb-metrics-pull.json` | FB · Metrics Pull (WF5) | schedule | `0 9 * * *` |
| `fb-queue-health.json` | FB · Queue Health (WF6) | schedule | `0 18 * * *` |
| `fb-strategic-refresh.json` | FB · Strategic Refresh (WF7) | schedule + webhook `fb-strategic-refresh` | `0 8 1 */3 *` |

## Status

**WF1 (Nightly Generator) and WF3 (Regeneration Webhook) logic is now complete** — they are no
longer skeletons. WF1 picks the next uncovered date (5-day horizon duplicate guard) or uses the
on-demand `scheduled_date`, merges the LRU subtopic + prompts + message bank, generates copy +
image, uploads to the public `fb-images` bucket, inserts a real `fb_posts` draft, and bumps the
subtopic's `last_used_at`/`times_used`. WF3 honors the system-of-record contract below: it reads
the latest feedback + post (never re-inserts feedback), regenerates the copy and/or image branch,
reuses a kept image when only copy was rejected, and flips the regenerated component back to
`pending` (alerting and stopping when `needs_manual` is already set). The other five workflows
(WF2/WF4/WF5/WF6/WF7) remain scaffolds for later milestones.

Current provider defaults (set as n8n credentials/values on import): **image** = OpenAI
`gpt-image-1` (endpoint hardcoded to `https://api.openai.com/v1/images/generations`; swap the
node for another photoreal provider if desired), **model** (`__ANTHROPIC_MODEL__`) =
`claude-sonnet-4-6`. The committed JSONs keep every secret as a placeholder — real values live
only in n8n.

## Import & setup

1. **Apply the migrations** (0003 + 0004) in LP Supabase; confirm the public
   `fb-images` bucket exists.
2. In n8n, **Import from File** for each JSON.
3. Replace placeholder tokens (search/replace per workflow):
   - `__SUPABASE_URL__` — LP Supabase project URL (and `__HL_SUPABASE_URL__` for WF2's
     inbound-message source, if you read the HL cache).
   - `YOUR_SUPABASE_SERVICE_ROLE_KEY` — LP service-role key (the `apikey`/Bearer value).
   - `__ANTHROPIC_API_KEY__`, `__ANTHROPIC_MODEL__` — your Claude key + a current model id.
   - `__IMAGE_API_KEY__` — image provider key (WF1/WF3 default to OpenAI `gpt-image-1`; the endpoint
     is hardcoded, so only the key needs setting unless you swap providers). Other workflows may still
     reference `__IMAGE_API_URL__`.
   - `__FB_GRAPH_VERSION__` (`v21.0`), `__FB_PAGE_ID__`, `__FB_PAGE_ACCESS_TOKEN__`.
   - `__GROUPME_BOT_ID__` — Sales Force bot id.
   - `__N8N_WEBHOOK_SECRET__` — must match the Dashboard's `N8N_WEBHOOK_SECRET`.
4. (Optional) Convert the inline service-key headers to proper n8n **credentials**
   (httpBearerAuth) as in the HL-MCP precedent.
5. Set the n8n instance timezone to **America/New_York** (workflows also set it).
6. **Activate** each workflow.

### Env / values used
`FB_GRAPH_VERSION=v21.0`, `FB_PAGE_ID`, `POST_TIME_LOCAL=06:00`, `TZ=America/New_York`,
`MAX_REGEN_ATTEMPTS=3`, `ANTHROPIC_MODEL`. (The Dashboard side only needs
`N8N_BASE_URL`, `N8N_WEBHOOK_SECRET`, `FB_GROUP_URL`/`NEXT_PUBLIC_FB_GROUP_URL`.)

## Dashboard → n8n webhook contract

The Dashboard fires authenticated POSTs (`Authorization: Bearer ${N8N_WEBHOOK_SECRET}`)
via `lib/n8n.ts → postWebhook(path, body)` to `${N8N_BASE_URL}/webhook/${path}`:

| Path | From | Body | Workflow |
|---|---|---|---|
| `fb-regenerate` | `rejectComponent()` | `{post_id, component, reason_code, reason_text, rejected_by}` | WF3 |
| `fb-generate-now` | `generateNow()` | `{scheduled_date}` | WF1 |
| `fb-run-miner` | `runMiner()` | `{}` | WF2 |
| `fb-strategic-refresh` | `runStrategicRefresh()` | `{}` | WF7 — §6.6 quarterly refresh (also runs on a quarterly schedule). Returns the proposals JSON; surfaced for human apply (no DB write). |

## System of record (WF3)

The **Dashboard is the system of record.** `lib/actions/content.ts → rejectComponent()`
is the authoritative writer of a rejection — before WF3 fires it has already:

1. inserted the `fb_post_feedback` row (snapshotting the rejected copy/image),
2. flipped the rejected component to `rejected`,
3. incremented `fb_posts.revision`, and
4. set `needs_manual=true` once `revision >= MAX_REGEN_ATTEMPTS`.

**WF3 consumes this — it must NOT insert feedback again.** It reads the latest
feedback, regenerates copy and/or image (reusing a kept image when only copy was
rejected), and sets the regenerated component back to `pending`. If `needs_manual`
is set, it alerts on GroupMe and stops. (The mirror of this note lives in
`fb-regeneration-webhook.json` and in `rejectComponent()`.)

## Known follow-up (WF4) — `target='both'` publish state

For `target='both'`, WF4 currently flips the whole row to `status='posted'` as soon
as the **Page** leg publishes. The **Group** leg is a human copy/post in the Dashboard
(`markPosted()`), tracked separately — there is no Group API. **Revisit when WF4 goes
live:** decide whether a `both` post should stay `approved` (or gain a `page_posted_at`
column) until the Group leg is recorded, so the calendar doesn't show a `both` post as
fully `posted` before the Group leg happens. (Flagged in `fb-page-publish.json` and in
`markPosted()`.)

## Hard constraint

**Nothing posts to a Facebook _Group_ via API** (Meta deprecated the Groups API in
April 2024). Group publishing is always a human "Copy + Open Group" → native post,
recorded via "Mark Posted". Page publishing (WF4) uses the Pages API and is fine.
