/**
 * Period resolver for the scorecard filter.
 *
 * Maps a period key (+ optional custom bounds) to a concrete window and a
 * SOURCING STRATEGY the read layer branches on:
 *   - "snapshot"  → read the stored MTD daily row (fast, no LP call). Default.
 *   - "recompute" → short window; call the LP-MCP preview route for [start,end]
 *                   (persist:false so it never overwrites the stored MTD row).
 *   - "aggregate" → long range; sum stored monthly snapshots and re-derive ratios
 *                   (do NOT live-recompute a whole quarter/year).
 *
 * Pure — reuses lib/date/sellingDays.ts for the selling-day calendar. asOf is the
 * window's data-current-through date (= periodEnd); only "today" is partial.
 */

import {
  type SellingCalendar,
  todayET,
  addDays,
  lastCompletedSellingDay,
} from "./sellingDays";

export type PeriodKey =
  | "today"
  | "yesterday"
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "select_month"
  | "qtd"
  | "ytd"
  | "custom";

export type PeriodSource = "snapshot" | "recompute" | "aggregate";

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string; // e.g. "This week · Jun 16–20"
  periodStart: string; // ET YYYY-MM-DD
  periodEnd: string; // ET YYYY-MM-DD
  asOf: string; // data current-through (= periodEnd)
  isPartial: boolean; // true only for "today"
  source: PeriodSource;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const VALID_KEYS = new Set<PeriodKey>([
  "today", "yesterday", "week", "last_week", "month",
  "last_month", "select_month", "qtd", "ytd", "custom",
]);

const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Parse a YYYY-MM-DD into numeric parts (no unchecked-index issues). */
function parts(ymd: string): { y: number; m: number; d: number } {
  const p = ymd.split("-");
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD. */
function dow(ymd: string): number {
  const { y, m, d } = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Last day of the month containing `ymd` (UTC-safe; day 0 of next month). */
function monthEnd(ymd: string): string {
  const { y, m } = parts(ymd);
  return new Date(Date.UTC(y, m, 0, 12, 0, 0)).toISOString().slice(0, 10);
}

/** Monday of the week containing `ymd` (selling week is Mon–Sat). */
function weekStart(ymd: string): string {
  const offset = (dow(ymd) + 6) % 7; // days since Monday
  return addDays(ymd, -offset);
}

/** First day of the quarter containing `ymd`. */
function quarterStart(ymd: string): string {
  const { y, m } = parts(ymd);
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, "0")}-01`;
}

function fmtDay(ymd: string): string {
  const { m, d } = parts(ymd);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Jun 16–20" within a month, "Jun 28–Jul 2" across months. */
function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth ? `${fmtDay(start)}–${parts(end).d}` : `${fmtDay(start)}–${fmtDay(end)}`;
}

const monthLabel = (ymd: string): string => {
  const { y, m } = parts(ymd);
  return `${MONTHS[m - 1]} ${y}`;
};

/**
 * Resolve a period key (+ optional custom bounds) against the selling calendar.
 * Unknown/missing key → "month" (MTD snapshot). Custom/select_month with invalid
 * bounds fall back to "month".
 */
export function resolvePeriod(
  key: string | undefined,
  bounds: { start?: string; end?: string },
  cal: SellingCalendar,
): ResolvedPeriod {
  const today = todayET();
  const lastDone = lastCompletedSellingDay(today, cal);
  const k: PeriodKey = VALID_KEYS.has(key as PeriodKey) ? (key as PeriodKey) : "month";

  // Helper to build the result with asOf = periodEnd (data current-through).
  const make = (
    pk: PeriodKey,
    periodStart: string,
    periodEnd: string,
    source: PeriodSource,
    label: string,
    isPartial = false,
  ): ResolvedPeriod => ({ key: pk, label, periodStart, periodEnd, asOf: periodEnd, isPartial, source });

  switch (k) {
    case "today":
      return make("today", today, today, "recompute", `Today · ${fmtDay(today)}`, true);

    case "yesterday":
      return make("yesterday", lastDone, lastDone, "recompute", `Yesterday · ${fmtDay(lastDone)}`);

    case "week": {
      const start = weekStart(today);
      const end = lastDone < start ? start : lastDone;
      return make("week", start, end, "recompute", `This week · ${fmtRange(start, end)}`);
    }

    case "last_week": {
      const thisMon = weekStart(today);
      const start = addDays(thisMon, -7);
      const end = addDays(thisMon, -2); // previous Saturday
      return make("last_week", start, end, "recompute", `Last week · ${fmtRange(start, end)}`);
    }

    case "last_month": {
      const lm = addDays(monthStart(today), -1); // last day of previous month
      const start = monthStart(lm);
      const end = monthEnd(lm);
      return make("last_month", start, end, "aggregate", monthLabel(start));
    }

    case "select_month": {
      const anchor = isYmd(bounds.start)
        ? bounds.start
        : /^\d{4}-\d{2}$/.test(bounds.start ?? "")
          ? `${bounds.start}-01`
          : null;
      if (!anchor) break; // fall through to month
      const start = monthStart(anchor);
      // Current month → cap at last completed selling day; past month → full month.
      const end = start.slice(0, 7) === today.slice(0, 7) ? lastDone : monthEnd(start);
      return make("select_month", start, end, "aggregate", monthLabel(start));
    }

    case "qtd": {
      const start = quarterStart(today);
      return make("qtd", start, lastDone, "aggregate", `Quarter to date · ${fmtRange(start, lastDone)}`);
    }

    case "ytd": {
      const start = `${today.slice(0, 4)}-01-01`;
      return make("ytd", start, lastDone, "aggregate", `Year to date · ${fmtRange(start, lastDone)}`);
    }

    case "custom": {
      if (isYmd(bounds.start) && isYmd(bounds.end) && bounds.start <= bounds.end) {
        return make("custom", bounds.start, bounds.end, "recompute", `Custom · ${fmtRange(bounds.start, bounds.end)}`);
      }
      break; // invalid bounds → fall through to month
    }
  }

  // Default / fallback: month-to-date snapshot.
  const start = monthStart(today);
  return make("month", start, lastDone, "snapshot", `${monthLabel(start)} (MTD)`);
}
