# Planning ownership — who owns the 30-day plan

**v1.0 · 2026-08-24 · applied live**

## The rule

**WF-Plan owns the calendar. WF-Strategist owns the angle. WF-Batch/WF1 own the draft.**

`fb_content_plan` has one row per date. Exactly one workflow writes each column:

| Column | Owner | Written by |
| --- | --- | --- |
| `pillar`, `archetype`, `subtopic_id`, `campaign`, `status` | WF-Plan | `fb-plan-period` |
| `brief`, `brief_status` | WF-Strategist | `fb-run-strategist` |
| — | WF-Batch / WF1 | writes `fb_posts`, reads the plan |

The Strategist may **annotate** a slot. It may never **create or change** one.

## Order of operations

```
1 · Plan calendar   →  2 · Write brief  →  Approve brief  →  3 · Generate drafts  →  Approve post
     (WF-Plan)          (WF-Strategist)     (dashboard)        (WF-Batch / WF1)       (dashboard)
```

Step 2 is optional. A slot with no brief still generates from its pillar and subtopic —
that is how August ran. A brief makes the post better; it is not a prerequisite.

## What was wrong (fixed 2026-08-24)

Both features wrote `pillar`. `Parse Brief` built its upsert row as:

```js
pillar: obj.pillar || b.existing_pillar || 'value'
```

The model's choice beat the plan, so **every Strategist run silently rewrote the
calendar**. Observed: 2026-10-01/02/03 should have been `uv` / `noise` / `energy` by
rotation and were all flipped to `insurance`.

The choice was almost always insurance because of four compounding causes:

1. **A dead branch in the season builder.** `if (m >= 6 && m <= 11)` fired first and
   reported "storm/insurance weigh heavier". The `else if (m >= 5 && m <= 9)` peak-heat
   line was unreachable June–September, so for four months a year the model heard
   exactly one seasonal instruction.
2. **The v2 prompt repeated the same tilt** in its step 5.
3. **The prompt never said the slot already had a pillar.** It asked the model to choose
   one of eight from scratch.
4. **Subtopics were never marked used.** All three October briefs picked the same
   `times_used: 0` subtopic, because reading that counter does not increment it.

Two secondary defects fell out of the same design: the brief and the slot disagreed on
archetype (the brief argued one, `Parse Brief` preserved another), and a Strategist run
on an unplanned date would conjure a slot with a default archetype.

## What changed

**WF-Strategist** (`OkEjUS037hQnKDA0`, published 2026-08-24)

- `Parse Brief` writes only `brief` + `brief_status`, and **PATCHes** instead of
  upserting. This matters: a brief-only upsert fails `23502` on `pillar`, because
  Postgres validates NOT NULL on the proposed insert row before it reaches
  `ON CONFLICT`. PATCH cannot create a row or touch a column it is not given, so the
  rule is enforced by the HTTP verb rather than by convention. Node renamed
  `Upsert Brief` → `Update Brief on Slot`.
- The brief's own `pillar` field is forced to the planned pillar, so the stored JSON can
  never argue against the slot it is attached to.
- `Build Strategist Request` refuses a date with no planned slot, returning
  `{ noop: true, reason }`. A new `Has planned slot?` IF routes that to `Respond`, so
  the dashboard gets a clean answer instead of a hung request.
- The slot's pillar / archetype / subtopic are passed in as `{{planned_pillar}}`,
  `{{planned_archetype}}`, `{{planned_subtopic}}`.
- Season context is additive — August now reports hurricane season **and** peak heat.
- The subtopic menu was removed from `{{recently_used}}`; only `recent_plan` remains.
- The **daily 7:00 AM ET schedule node is disabled**. It had been a silent no-op for
  weeks (every slot through Sept 1 already had a brief, so `Build` returned early), and
  would have started rewriting pillars unattended once the Sept–Oct slots were planned.
  It is now non-destructive and can be re-enabled by un-disabling that one node.

**WF-Plan** (`TeeZlqDQdiwgLe7a`, published 2026-08-24)

- `Build Plan Request` computes the real window (`today .. today+N-1`), subtracts dates
  that already have a slot, and asks for exactly the open dates. Previously the model
  appended past the last planned date, so two clicks pushed the calendar 60 days out.
- `Parse Plan + Build Rows` drops any date outside `allowed_dates`. The model can
  suggest whatever it likes; only in-window dates are written.
- Empty window returns `{ noop, reason }` via a new `Anything to plan?` IF.

**Prompt** — `strategist` v3 active, v2 retained for rollback. See
`db/migrations/0015_strategist_v3_plan_owns_pillar.sql`.

**Dashboard** — the three controls are numbered in run order with an explainer line.

## Verification (2026-08-24)

| Check | Result |
| --- | --- |
| Strategist on an unplanned date (2027-01-15) | `noop` + "Plan the calendar first" — no row created |
| Strategist on a planned `noise` slot (2026-10-02) | slot kept `noise`; brief pillar `noise`; story archetype honoured; 10-01 and 10-03 untouched |
| Second Plan click, same window | "Calendar already covers 2026-08-24 through 2026-09-22" — calendar still ends 2026-10-23 |
| Rotation 2026-09-28 → 2026-10-12 | continuous, no repeats on consecutive days |

## Open items

- `n8n/fb-strategist.json` and `n8n/fb-plan-period.json` still hold the pre-fix node
  code. Re-export both from n8n to restore repo/live parity.
- The 2026-09-01 brief argues a `myth-bust` archetype while its slot says `lead-magnet`
  — a leftover from the old behaviour. Review by hand before that date generates.
- `postWebhook` in `lib/n8n.ts` discards the response body, so the `noop.reason` text
  never reaches the UI. The guard still works (the run is refused server-side); the user
  just sees the generic "working" message. Surfacing the reason needs `postWebhook` to
  return the parsed body and `runStrategist` / `planPeriod` to pass it through.
