/**
 * Shared time helpers anchored to Reece's business timezone (America/New_York).
 *
 * Day boundaries are computed in ET so "today", "this month", and custom ranges
 * match how staff read the calendar, regardless of where the server runs. The
 * core helpers (`tzOffsetMinutes`, `businessDayStart`) were lifted verbatim from
 * lib/queries/headlineStats.ts so both the headline cards and the scorecard
 * period selector share one definition of a day.
 */

export const BUSINESS_TZ = "America/New_York";
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Minutes that `tz` is offset from UTC at the given instant (e.g. EDT → -240). */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUTC - at.getTime()) / 60000;
}

/** Calendar Y/M/D (1-based month) of `base` as read in BUSINESS_TZ. */
export function etParts(base: Date): { year: number; month: number; day: number } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base); // "YYYY-MM-DD"
  const parts = ymd.split("-");
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

/** UTC instant of ET-midnight for the given ET calendar date (1-based month). */
export function etMidnight(year: number, month: number, day: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const utcMidnight = new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(BUSINESS_TZ, utcMidnight);
  return new Date(utcMidnight.getTime() - offsetMin * 60000);
}

/** UTC instant of midnight (start of the calendar day) in BUSINESS_TZ for `base`. */
export function businessDayStart(base: Date): Date {
  const { year, month, day } = etParts(base);
  return etMidnight(year, month, day);
}

/** ET-midnight `n` whole days before `base` (re-anchored each step, DST-safe). */
function etMidnightDaysAgo(base: Date, n: number): Date {
  return businessDayStart(new Date(base.getTime() - n * DAY_MS));
}

/** Number of ET calendar days in `month` (1-based) of `year`. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type PeriodKey = "day" | "week" | "month" | "q" | "ytd" | "custom";

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  /** Inclusive lower bound (ET-midnight UTC instant). */
  start: Date;
  /** Exclusive upper bound (now, or ET-midnight after the custom end date). */
  end: Date;
};

const PRESET_LABELS: Record<Exclude<PeriodKey, "custom">, string> = {
  day: "Today",
  week: "Last 7 days",
  month: "Month to date",
  q: "Last 90 days",
  ytd: "Year to date",
};

function isYmd(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function fmtYmd(d: Date): string {
  const { year, month, day } = etParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Resolve the URL period params to a concrete ET window. Presets map to:
 * day = today; week = last 7 days; month = month-to-date; q = last 90 days;
 * ytd = Jan 1 → now; custom = [start, end] (validated start ≤ end, else month).
 * Default preset is `month`.
 */
export function resolvePeriod(
  sp: { period?: string; start?: string; end?: string } = {},
  now: Date = new Date(),
): ResolvedPeriod {
  const key = (sp.period ?? "month") as PeriodKey;
  const { year } = etParts(now);

  if (key === "custom") {
    if (isYmd(sp.start) && isYmd(sp.end) && sp.start <= sp.end) {
      const s = sp.start.split("-");
      const e = sp.end.split("-");
      const start = etMidnight(Number(s[0]), Number(s[1]), Number(s[2]));
      // Exclusive upper bound: ET-midnight of the day AFTER the end date, so the
      // whole of the end day is included.
      const end = new Date(etMidnight(Number(e[0]), Number(e[1]), Number(e[2])).getTime() + DAY_MS);
      return { key, label: `${sp.start} → ${sp.end}`, start, end };
    }
    // Invalid custom range — fall back to month-to-date.
    return resolvePeriod({ period: "month" }, now);
  }

  let start: Date;
  switch (key) {
    case "day":
      start = businessDayStart(now);
      break;
    case "week":
      start = etMidnightDaysAgo(now, 6); // 7 calendar days incl. today
      break;
    case "q":
      start = etMidnightDaysAgo(now, 89); // 90 calendar days incl. today
      break;
    case "ytd":
      start = etMidnight(year, 1, 1);
      break;
    case "month":
    default: {
      const { year: y, month: m } = etParts(now);
      start = etMidnight(y, m, 1);
      break;
    }
  }
  const resolvedKey: PeriodKey = key === "day" || key === "week" || key === "q" || key === "ytd" ? key : "month";
  return { key: resolvedKey, label: PRESET_LABELS[resolvedKey], start, end: now };
}

/** Whole ET days spanned by [start, end); at least 1. */
export function periodDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

/**
 * Calendar-days proration of a monthly $ goal to an arbitrary window: for each
 * calendar month the window touches, add `monthlyGoal / daysInThatMonth × (days
 * of that month inside the window)`. Cleanly handles week/quarter/YTD/custom.
 */
export function prorateGoalCalendar(start: Date, end: Date, monthlyGoal: number): number {
  if (!(monthlyGoal > 0) || end <= start) return 0;
  let total = 0;
  // Walk month segments from the month of `start` to the month of `end`.
  let cursor = (() => {
    const { year, month } = etParts(start);
    return etMidnight(year, month, 1);
  })();

  while (cursor < end) {
    const { year, month } = etParts(cursor);
    const dim = daysInMonth(year, month);
    const monthStart = etMidnight(year, month, 1);
    const nextMonth = etMidnight(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1);
    const segStart = start > monthStart ? start : monthStart;
    const segEnd = end < nextMonth ? end : nextMonth;
    const overlapDays = Math.max(0, Math.round((segEnd.getTime() - segStart.getTime()) / DAY_MS));
    total += (monthlyGoal / dim) * overlapDays;
    cursor = nextMonth;
  }
  return Math.round(total);
}
