# `revenue_as_of` — what sets it, why it lags, and what the scorecard does about it

Written 2026-08-11 in response to a live defect: on that date
`lp_market_scorecard_daily` carried `max(as_of_date) = 2026-08-10` but
`max(revenue_as_of) = 2026-08-06`. Counts had caught up; revenue had not. Every
revenue pace figure divided money settled through Aug 6 by a target prorated to
Aug 10, so every market read "behind pace" regardless of performance.

This document exists because the column was invisible. It had been on the table
since `sql/040_scorecard_source_precedence.sql` and **nothing read it** — which
is precisely how a four-day-old revenue figure came to render
indistinguishably from a current one.

## What sets it

`revenue_as_of` is the **coverage end date of the Net Report snapshot that
supplied the month's authoritative RTP net.** It is not a settlement lag
computed by anything, and it is not derived from the calendar.

The chain, all in LP-MCP:

1. `lp_net_report_rtp` holds one row per (market, report_month, report_as_of).
   `report_as_of` is the report's own coverage end date.
2. `scorecard-rtp-source.js:computeAuthoritativeRtpNet()` reads that table for
   the month and keeps **only the latest snapshot** (`max(report_as_of)`),
   returning it as `revenueAsOf`.
3. `goal-scorecard-daily.js` writes that value onto each market's daily row as
   `revenue_as_of`, alongside `released_dollars` and
   `revenue_basis = 'rtp_net_by_milestone_date'`.

`lp_net_report_rtp` is populated by `POST /n8n/admin/net-report-ingest` — a
manual or scheduled file drop. **LP has no report API for this**, so the table
only advances when someone posts a newer export.

## Is the lag a settlement watermark or an implementation artifact?

**Both, and the distinction matters — so this is stated precisely rather than
collapsed to one answer.**

### The knowledge boundary is real

The warehouse cannot produce net at all. `scorecard-rtp-source.js` says so
directly: there is no `netamount` field, and `finamount` only recovers net for
cleanly financed deals. The Net Report is therefore the **only** source of RTP
net, by design and not as a gap.

The consequence: **net revenue through date D is unknowable until a report
covering D exists.** That is a genuine watermark. It is not an off-by-one to be
corrected, and no amount of code makes revenue known past it. This is also why
the PROVISIONAL column exists — warehouse RTP *gross* for the days after
`revenue_as_of`, explicitly labelled a pace signal and never blended into the
authoritative figure.

### The position of the watermark is set by ingest cadence

What is *not* intrinsic is how far back the watermark sits. It moves only when
a report is posted, and the posting cadence is irregular:

| report_month | report_as_of | ingested_at (UTC) |
|---|---|---|
| 2026-08 | 2026-08-06 | 2026-08-06 11:00 |
| 2026-08 | 2026-08-05 | 2026-08-05 22:22 |
| 2026-07 | 2026-07-31 | 2026-08-06 21:41 |
| 2026-07 | 2026-07-23 | 2026-07-23 22:19 |
| 2026-07 | 2026-07-09 | 2026-07-13 19:35 |

No August report has been ingested since **2026-08-06 11:00 UTC** — five days
before this was written. July went 9th → 23rd → 31st. So the four-day gap on
Aug 11 is not four days of settlement mechanics; it is four days of nobody
posting a file.

Both halves are load-bearing. Treating it as purely a watermark would excuse a
stale feed forever. Treating it as purely a bug would imply the dashboard can
compute a fresher net than any report supports, which it cannot.

## The decision (O2)

**Keep the RTP daily table as the PRIMARY revenue source, and align the revenue
pacing target to `revenue_as_of`.**

This is the first branch of the decision tree, chosen because the knowledge
boundary is genuine: the dashboard must not claim revenue past the last report,
and the honest response to "revenue reaches Aug 6" is to measure it against a
target that also reaches Aug 6.

Rationale for each rejected alternative:

- **"Fix the lag; the watermark is moot."** Rejected. Even with a perfect daily
  ingest, `revenue_as_of` still trails `as_of_date` on any day a report has not
  yet landed. The alignment is required regardless of cadence. Improving the
  ingest cadence is worth doing, but it is an operational change that shrinks
  the gap — it does not remove the need to prorate to the watermark.

- **Move the tile to report 137.** Rejected, and not a close call. 137 is
  fresher (its Aug snapshot is as-of 2026-08-11 against the Net Report's
  2026-08-06), but freshness is not the question. 137 measures the **sold**
  cohort — jobs contracted in the period, with NSA net of cancellations, credit
  declines, holds and working. The RTP table measures **released to
  production**, dated by the production milestone, which includes work
  contracted in earlier periods and excludes work sold this period that has not
  shipped. They are different business states, not the same state at two
  freshnesses. Swapping one for the other because it updates more often would
  silently redefine "Net Released" — exactly the migration this work exists to
  prevent. Only an explicit leadership redefinition should move that tile.

## What the code does now

- The revenue pace target prorates to the selling days elapsed through
  `revenue_as_of`, not through the period's own as-of. For Fort Myers in
  August 2026 that is 5 of 26 selling days (through Aug 6), giving a
  target-to-date of **$500,000** against a $2,600,000 monthly goal — not the
  $800,000 that 8 of 26 produces.
- The hero's revenue tiles state the date they reach ("released through
  Aug 6"), and the Target-to-Date tile states the same date, so the numerator
  and denominator visibly agree.
- Counts panels keep their own, later as-of. Two different dates on one screen
  is intended: one figure built from two dates is the thing being fixed.

See `lib/scorecard/viewModel.ts` (revenue anchor) and
`lib/queries/scorecard.ts` (`revenue_goal_to_date_dollars`).

## The separate off-by-one found while here

The panel read "8 / 26 elapsed" while the Fort Myers target-to-date was
$700,000 — exactly 7/26 of $2.6M. Neither figure was assumed correct; both were
checked against `lib/date/sellingDays.ts`:

| through | selling days |
|---|---|
| 2026-08-06 | 5 |
| 2026-08-08 | 7 |
| 2026-08-10 | 8 |

August 2026 has 26 selling days, and `lastCompletedSellingDay('2026-08-11')` is
`2026-08-10`. So **8 was right** and the $700,000 came from a snapshot whose
stored `days_elapsed` was still 7.

The cause was structural, not arithmetic: the view model computes elapsed from
the **calendar** (immune to a stalled feed), while `derive()` prorated the
single-month goal from the snapshot's stored `days_elapsed`. When the feed
lagged, the two disagreed and the target silently shrank in step with the
missing actuals. Both now anchor to the calendar, so a quiet feed makes the
page look worse rather than better — the same rule already applied to the
elapsed-day display.
