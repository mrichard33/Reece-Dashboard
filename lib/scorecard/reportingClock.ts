/**
 * ONE reporting cutoff for the scorecard.
 *
 * ── The defect this exists to end ────────────────────────────────────────────
 *
 * On 2026-08-11 the page rendered five dates and presented them as one period:
 * "Data through 08-10", "live sync through 08-10", "report 137 · as of 08-11",
 * "Released … 08-06". A reader concluded the numbers were mixed, and the
 * conclusion was reasonable even though the numbers were fine.
 *
 * They were fine because report 137's snapshot was:
 *
 *     period_start 2026-08-01   period_end 2026-08-10
 *     as_of_date   2026-08-11   is_partial_month false
 *
 * `period_end` is what the file COVERS. `as_of_date` is when LP RAN it. The
 * dollars stopped on the 10th; only the label said otherwise, because
 * `lp_cohort_maturation` published `observed_on = as_of_date` and did not expose
 * `period_end` at all. Correctness depended on two dates happening to agree,
 * which for an MTD file they never do.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * Every current-period source declares how far its DATA reaches. One cutoff is
 * declared from the calendar. Then:
 *
 *   dataThrough  >  cutoff   →  REFUSED. The figure contains activity after the
 *                               reporting period and may not be rendered as a
 *                               current-period actual. This is the hard gate.
 *   dataThrough  <  cutoff   →  LAGGING. Renders, with the lag stated. Never
 *                               blanked — a late feed is not a missing one.
 *   dataThrough  ==  cutoff  →  CURRENT.
 *   dataThrough unknown      →  UNVERIFIED. Renders, badged. A file that cannot
 *                               say what it covers is not evidence of a
 *                               violation, so it is not punished with a blank —
 *                               but it may not set the achieved cutoff either.
 *
 * Two exemptions, and only two, both of which must state a reason in the type:
 *
 *   • RTP / Released (report 134) is dated by PRODUCTION MILESTONE. A contract
 *     sold in April is released in August. It is not late, it is answering a
 *     different question, and it lives in its own panel.
 *   • Historical cohort maturation legitimately carries an observation date
 *     later than the cutoff — that is the whole point of re-observing a closed
 *     month. That date is `observed_on` and it must never date a current-period
 *     figure.
 *
 * ── Why the pace anchor moves with the data ──────────────────────────────────
 *
 * Ruling 2026-08-13: the target prorates to elapsed selling days through the
 * goal-bearing source's OWN dataThrough, so numerator and denominator always
 * share a date.
 *
 * ⚠️ This reverses the ruling recorded at viewModel.ts (≈:277-288), "the feed
 * going quiet must make the page look WORSE, not better", and it is important to
 * be honest about the direction: on 2026-08-12, anchoring to the achieved 08-10
 * rather than the declared 08-11 improves Balance by $423,553 and Projected Pace
 * by $669,117 on identical data, purely because a feed is late.
 *
 * That is only safe because the lag is now structurally inseparable from the
 * number: `Gated<T>` carries the audit, so a panel cannot hold the figure
 * without also holding the verdict that qualifies it. The old ruling used
 * misalignment as a stall detector; the badge does that job now, and does it
 * without making the pace percentage arithmetically false.
 */

import type { SellingCalendar } from "@/lib/date/sellingDays";
import { lastCompletedSellingDay, sellingDaysElapsed, sellingDaysInPeriod } from "@/lib/date/sellingDays";
import { stalenessSellingDays, stalenessCalendarDays, stalenessPhraseFull } from "@/lib/scorecard/freshness";
import { measured, unmeasured, type Measured } from "@/lib/scorecard/tiers/types";

/**
 * Every source that puts a number on the scorecard, as a CLOSED union.
 *
 * Closed on purpose: `buildReportingClock` takes a total `Record<SourceId, …>`,
 * so adding a source without registering a clock for it fails `tsc`. An
 * unregistered source is exactly how the five-dates problem got in.
 */
export type SourceId =
  | "net_sales" // report 137 via lp_cohort_maturation — GOAL-BEARING
  | "live_sync" // lp_market_scorecard_daily — funnel counts, rates, per-day
  | "released_rtp"; // report 134 jobs_by_milestone — EXEMPT

/**
 * Why a source may sit off-cutoff. A union rather than a string literal, so an
 * exemption cannot be granted without recording the reason in the type — which
 * is how a gate gets quietly widened.
 */
export type ClockRole =
  | { kind: "current_period"; goalBearing?: true }
  | { kind: "exempt"; why: string };

export type SourceClock = {
  id: SourceId;
  /** Human label for the badge, e.g. "Net Sales · report 137". */
  label: string;
  role: ClockRole;
  /**
   * How far the DATA reaches. Never a run date.
   * Unmeasured when the file cannot say (report 137's `is_partial_month`).
   */
  dataThrough: Measured<string>;
  /**
   * When the report RAN / was observed. Display only — never gated on, never
   * paced against. This is the field that was masquerading as coverage.
   */
  stampedAt: string | null;
};

export type ClockStatus = "current" | "lagging" | "unverified" | "refused";

export type SourceAudit = {
  readonly clock: SourceClock;
  readonly status: ClockStatus;
  /** Behind the CUTOFF, in selling days. Null when there is nothing to measure. */
  readonly lagSellingDays: number | null;
  /** Age measured to TODAY, in calendar days. A different anchor, deliberately. */
  readonly lagCalendarDays: number | null;
  /** Selling days elapsed through THIS source's own coverage — its pace anchor. */
  readonly elapsed: Measured<number>;
  /** One actionable sentence. Non-empty on every status. */
  readonly note: string;
};

export type ReportingCutoff = {
  /**
   * The calendar cutoff: last completed selling day, clamped to the period end.
   * Pure arithmetic over `today` — no data input, so it cannot fail and no feed
   * can move it. THE GATE CEILING.
   */
  readonly declared: string;
  readonly declaredBasis: "last_completed_selling_day" | "period_end";
  /** What the goal-bearing source actually reached. */
  readonly achieved: Measured<string>;
  readonly achievedFrom: SourceId | null;
  /** Elapsed selling days for pacing — the numerator's mate. */
  readonly paceElapsedDays: number;
  /** Elapsed through `declared`. Kept so a tile can show BOTH and the gap. */
  readonly calendarElapsedDays: number;
  readonly periodSellingDays: number;
  /** declared − achieved, in selling days. 0 when aligned. */
  readonly anchorLagSellingDays: number;
};

export type ClockAudit = {
  readonly cutoff: ReportingCutoff;
  readonly bySource: Readonly<Record<SourceId, SourceAudit>>;
  readonly refused: SourceId[];
  readonly lagging: SourceId[];
  /**
   * EVERY current-period source refused at once. That is not a data event — no
   * plausible feed failure moves every source past the cutoff simultaneously —
   * it is prima facie a clock bug. Callers render ungated-but-badged rather than
   * blanking the page. See the anti-blanking tests.
   */
  readonly systemicRefusal: boolean;
  /** Registry violations. Collected, never thrown — this module cannot fail. */
  readonly problems: string[];
};

/**
 * A value that cannot be read without first reading the verdict on it.
 *
 * ⚠️ NOT `Measured<T>`, and the difference is load-bearing. `Measured` keeps
 * `value: null` on its unknown branch so `valueOf()` can feed arithmetic that
 * tolerates absence. The gate must NOT tolerate absence. Omitting the `value`
 * key entirely from `refused` makes `g.value` a COMPILE ERROR until the caller
 * narrows on `status` — TypeScript refuses property access that is not present
 * on every member of a union. That is the strongest "cannot be ignored"
 * available without a runtime wrapper.
 */
export type Gated<T> =
  | { status: "current"; value: T; audit: SourceAudit }
  | { status: "lagging"; value: T; audit: SourceAudit }
  | { status: "unverified"; value: T; audit: SourceAudit }
  | { status: "refused"; audit: SourceAudit; reason: string };

/**
 * The calendar cutoff: end of the previous business day, clamped to the period.
 *
 * The clamp is not cosmetic. Viewing July on 2026-08-12 must declare 2026-07-31,
 * not 2026-08-11 — otherwise every July figure sits "behind" a cutoff outside
 * its own period, and a July file covering all of July would look stale forever.
 */
export function declaredCutoff(
  today: string,
  period: { periodStart: string; periodEnd: string },
  cal: SellingCalendar,
): { date: string; basis: ReportingCutoff["declaredBasis"] } {
  const lastDone = lastCompletedSellingDay(today, cal);
  return lastDone <= period.periodEnd
    ? { date: lastDone, basis: "last_completed_selling_day" }
    : { date: period.periodEnd, basis: "period_end" };
}

function judge(
  clock: SourceClock,
  cutoff: string,
  today: string,
  periodStart: string,
  cal: SellingCalendar,
  /**
   * Has the period fully elapsed? Equivalent to `declaredCutoff` having clamped
   * to `period_end` — the last completed selling day is past the period, so
   * nothing in it can still move. See the E4 note in the exempt branch.
   */
  periodClosed: boolean,
): SourceAudit {
  const exempt = clock.role.kind === "exempt";

  if (!clock.dataThrough.known) {
    return {
      clock,
      status: exempt ? "current" : "unverified",
      lagSellingDays: null,
      lagCalendarDays: null,
      elapsed: unmeasured<number>(clock.dataThrough.reason),
      note: exempt
        ? `${clock.label} does not declare coverage, and is exempt: ${(clock.role as { why: string }).why}`
        : `${clock.label} does not declare how far it covers — ${clock.dataThrough.reason}. ` +
          `It is shown, but it cannot set the reporting cutoff.`,
    };
  }

  const through = clock.dataThrough.value;
  const elapsed = measured(sellingDaysElapsed(periodStart, through, cal));
  const lagSelling = stalenessSellingDays(through, cutoff, cal);
  const lagCalendar = stalenessCalendarDays(through, today);

  // An exempt source is never judged against the cutoff — that is what the
  // exemption IS. It still reports its lag so the panel can state its own date.
  if (exempt) {
    const why = (clock.role as { why: string }).why;
    // ── E4 — A CLOSED PERIOD IS DATED BY ITS BOUNDARY ───────────────────────
    //
    // `through` on an exempt source is its last OBSERVED ACTIVITY — for report
    // 134 that is the most recent production milestone, i.e. `max(milestone
    // date)`. On a still-running period that is a genuine watermark. On a
    // CLOSED one it is a completeness date, and reporting it as reach reads as
    // missing data: July rendered "Released to production reaches 07-23-2026"
    // for a month whose snapshot declares `period_end` 2026-07-31, is not
    // partial, and was generated on 08-09. Nothing was missing — the month
    // ended quietly.
    //
    // Same defect class as §10's MIN-across-a-range and D2's banner: a
    // COMPLETENESS date read as staleness. So for a closed period the coverage
    // statement is the period end, with the last-activity date kept beside it
    // rather than dropped.
    const note =
      periodClosed && through <= cutoff
        ? `${clock.label} covers this closed period in full, through ${cutoff}. Its latest ` +
          `activity was ${through} — a completeness date, not a shortfall: ${why}`
        : `${clock.label} reaches ${through} on its own basis: ${why}`;
    return {
      clock,
      status: "current",
      lagSellingDays: lagSelling,
      lagCalendarDays: lagCalendar,
      elapsed,
      note,
    };
  }

  if (through > cutoff) {
    return {
      clock,
      status: "refused",
      lagSellingDays: null,
      lagCalendarDays: lagCalendar,
      elapsed,
      note:
        `${clock.label} covers through ${through}, past the reporting cutoff of ${cutoff}. ` +
        `A current-period figure may not contain activity after the cutoff, so it is not shown.`,
    };
  }

  if (through === cutoff) {
    return {
      clock,
      status: "current",
      lagSellingDays: 0,
      lagCalendarDays: lagCalendar,
      elapsed,
      note: `${clock.label} is current through ${through}.`,
    };
  }

  return {
    clock,
    status: "lagging",
    lagSellingDays: lagSelling,
    lagCalendarDays: lagCalendar,
    elapsed,
    note:
      `${clock.label} reaches ${through}; the reporting cutoff is ${cutoff}. ` +
      `${stalenessPhraseFull(lagSelling, lagCalendar) ?? "Behind the cutoff"}.`,
  };
}

/**
 * Assemble the audit. Total: never throws, never returns null.
 *
 * `today` is INJECTED rather than read from a clock inside. Two reasons: the
 * module stays pure and unit-testable, and — more importantly — a caller that
 * passed a UTC date instead of an ET one would, between 20:00 and midnight ET,
 * move the declared cutoff forward a day and refuse every source at once. Making
 * it a required parameter puts that decision at the call site where `todayET()`
 * is visible.
 */
export function buildReportingClock(input: {
  today: string;
  period: { periodStart: string; periodEnd: string };
  cal: SellingCalendar;
  sources: Record<SourceId, SourceClock>;
}): ClockAudit {
  const { today, period, cal, sources } = input;
  const { date: declared, basis } = declaredCutoff(today, period, cal);

  const bySource = {} as Record<SourceId, SourceAudit>;
  const problems: string[] = [];
  for (const id of Object.keys(sources) as SourceId[]) {
    const clock = sources[id];
    if (clock.id !== id) problems.push(`clock registered under "${id}" declares id "${clock.id}"`);
    // `basis === "period_end"` IS the closed test: declaredCutoff only clamps
    // there when the last completed selling day has run past the period.
    bySource[id] = judge(clock, declared, today, period.periodStart, cal, basis === "period_end");
  }

  const currentPeriod = (Object.keys(bySource) as SourceId[]).filter(
    (id) => sources[id].role.kind === "current_period",
  );
  const goalBearing = currentPeriod.filter(
    (id) => (sources[id].role as { goalBearing?: true }).goalBearing === true,
  );
  if (goalBearing.length !== 1) {
    problems.push(
      `exactly one source must be goal-bearing; found ${goalBearing.length} (${goalBearing.join(", ") || "none"})`,
    );
  }

  const refused = currentPeriod.filter((id) => bySource[id].status === "refused");
  const lagging = currentPeriod.filter((id) => bySource[id].status === "lagging");

  // The achieved cutoff comes from the goal-bearing source ALONE — not a min
  // across sources (which would drag the sales anchor onto an unrelated feed's
  // outage) and not a max (which would overstate). A refused or unverified
  // source cannot set it: a figure we will not render must not decide the pace.
  const anchorId = goalBearing[0] ?? null;
  const anchorAudit = anchorId ? bySource[anchorId] : null;
  const achieved: Measured<string> =
    anchorAudit && anchorAudit.clock.dataThrough.known && anchorAudit.status !== "refused"
      ? measured(anchorAudit.clock.dataThrough.value)
      : unmeasured<string>(
          anchorAudit
            ? `${anchorAudit.clock.label}: ${anchorAudit.note}`
            : "no goal-bearing source is registered",
        );

  const calendarElapsedDays = sellingDaysElapsed(period.periodStart, declared, cal);
  // Falling back to the declared cutoff when the anchor is unknown preserves the
  // pre-2026-08-13 behaviour rather than zeroing the target — which would read
  // as "nothing was expected", the most flattering possible lie.
  const paceElapsedDays = achieved.known
    ? sellingDaysElapsed(period.periodStart, achieved.value, cal)
    : calendarElapsedDays;

  return {
    cutoff: {
      declared,
      declaredBasis: basis,
      achieved,
      achievedFrom: achieved.known ? anchorId : null,
      paceElapsedDays,
      calendarElapsedDays,
      periodSellingDays: sellingDaysInPeriod(period.periodStart, period.periodEnd, cal),
      anchorLagSellingDays: Math.max(0, calendarElapsedDays - paceElapsedDays),
    },
    bySource,
    refused,
    lagging,
    systemicRefusal: currentPeriod.length > 0 && refused.length === currentPeriod.length,
    problems,
  };
}

/**
 * Bind a value to its verdict. The ONLY way a current-period figure should reach
 * a component.
 */
export function gate<T>(audit: SourceAudit, value: T | null): Gated<T> {
  if (audit.status === "refused") {
    return { status: "refused", audit, reason: audit.note };
  }
  if (value === null || value === undefined) {
    // Absent for an ordinary reason (fetch failure, no rows). Not a gate
    // violation — the caller's own "Unavailable" path handles it — but it must
    // not be dressed as a rendered figure either.
    return { status: "refused", audit, reason: `${audit.clock.label} returned no value.` };
  }
  return { status: audit.status, value, audit } as Gated<T>;
}

/** "1 selling day behind, 2 calendar days old" — null when there is nothing to say. */
export function lagBadge(audit: SourceAudit): string | null {
  if (audit.status === "current") return null;
  if (audit.status === "unverified") return "coverage not declared";
  if (audit.status === "refused") return "after the reporting cutoff";
  return stalenessPhraseFull(audit.lagSellingDays, audit.lagCalendarDays);
}

/**
 * The ONE date the page header shows.
 *
 * It shows the ACHIEVED cutoff, not the declared one, because the header answers
 * "what period do these numbers describe?" and only the achieved date is true of
 * every current-period figure. Printing the declared date over data that stops
 * earlier is precisely the bug this module exists to remove.
 *
 * The declared date rides along whenever they differ, because achieved-alone
 * hides a stall: a feed frozen for a week would keep calmly reporting its own
 * frozen date with nothing to measure it against.
 */
export function clockChip(cutoff: ReportingCutoff): { text: string; title: string } {
  if (!cutoff.achieved.known) {
    return {
      text: `Reporting through ${cutoff.declared}`,
      title:
        `No sales source declared its coverage, so this is the calendar cutoff — the last ` +
        `completed selling day — not a measured date. ${cutoff.achieved.reason}`,
    };
  }
  const behind = cutoff.anchorLagSellingDays;
  return {
    text:
      behind > 0
        ? `Reporting through ${cutoff.achieved.value} · ${behind} selling day${behind === 1 ? "" : "s"} behind`
        : `Reporting through ${cutoff.achieved.value}`,
    title:
      behind > 0
        ? `Every current-period figure on this page covers through ${cutoff.achieved.value}. ` +
          `The cutoff for ${"today"} is ${cutoff.declared}, so the sales feed is ${behind} selling ` +
          `day${behind === 1 ? "" : "s"} behind — and the target is prorated to ${cutoff.paceElapsedDays} ` +
          `of ${cutoff.periodSellingDays} selling days to match, not ${cutoff.calendarElapsedDays}.`
        : `Every current-period figure on this page covers through ${cutoff.achieved.value}, ` +
          `which is the reporting cutoff: the last completed selling day. ` +
          `${cutoff.paceElapsedDays} of ${cutoff.periodSellingDays} selling days elapsed.`,
  };
}
