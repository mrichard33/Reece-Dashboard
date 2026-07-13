/**
 * Selling-day calendar — read-side mirror of LP-MCP/src/selling-days.js.
 *
 * The LP-MCP daily job is the source of truth: it persists `days_elapsed`
 * (selling days elapsed) and `working_days_in_period` (selling days in the
 * month) onto each snapshot, and the scorecard read layer consumes those
 * directly. This module exists for the things the snapshot can't answer at read
 * time — chiefly the "is the snapshot stale?" guard, which needs to know the
 * last completed selling day relative to *now* — and to seed the future global
 * period filter.
 *
 * Keep this in sync with the LP-MCP module: Mon–Sat selling by default, Sunday
 * off, and the Reece closure list — the SINGLE source of truth for holidays lives
 * in lib/date/holidays.ts (do NOT re-derive closures here). That list is NOT the
 * federal-holiday calendar (Juneteenth stays a selling day). Config is read from
 * the same server env vars (SCORECARD_SELLING_DAYS / SCORECARD_HOLIDAYS); with no
 * env override the frozen holidays.ts list applies. Pure functions — server-side
 * only (reads process.env).
 */

import { reeceHolidays } from "./holidays";

const ET = "America/New_York";
const DOW_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type SellingCalendar = {
  sellingDows: Set<number>;
  holidays: (year: number) => Set<string>;
};

/** Today's ET calendar date as YYYY-MM-DD. */
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Add N calendar days to a YYYY-MM-DD (noon-UTC anchor avoids DST edges). */
export function addDays(ymd: string, n: number): string {
  const p = ymd.split("-");
  const anchor = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + n);
  const yy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD. */
function dowFromYMD(ymd: string): number {
  const p = ymd.split("-");
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0)).getUTCDay();
}

/** Resolve the selling calendar from server env (mirrors the LP-MCP defaults). */
export function resolveSellingCalendar(
  env: Record<string, string | undefined> = process.env,
): SellingCalendar {
  const dowRaw = (env.SCORECARD_SELLING_DAYS || "mon,tue,wed,thu,fri,sat")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const sellingDows = new Set(
    dowRaw.map((name) => DOW_NAMES.indexOf(name)).filter((i) => i >= 0),
  );

  const rawHolidays = (env.SCORECARD_HOLIDAYS || "").trim();
  let explicitSet: Set<string> | null = null;
  if (rawHolidays.toLowerCase() === "none") {
    explicitSet = new Set();
  } else {
    const explicit = rawHolidays
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    explicitSet = explicit.length ? new Set(explicit) : null;
  }

  const cache = new Map<number, Set<string>>();
  const holidays = (year: number): Set<string> => {
    if (!cache.has(year)) cache.set(year, explicitSet ?? reeceHolidays(year));
    return cache.get(year)!;
  };

  return { sellingDows, holidays };
}

export function isSellingDay(ymd: string, cal: SellingCalendar): boolean {
  if (!cal.sellingDows.has(dowFromYMD(ymd))) return false;
  return !cal.holidays(Number(ymd.slice(0, 4))).has(ymd);
}

/** Count selling days in [start, asOf] inclusive; 0 when asOf < start. */
export function sellingDaysElapsed(start: string, asOf: string, cal: SellingCalendar): number {
  if (asOf < start) return 0;
  let count = 0;
  for (let cur = start; cur <= asOf; cur = addDays(cur, 1)) {
    if (isSellingDay(cur, cal)) count++;
  }
  return count;
}

export function sellingDaysInPeriod(
  periodStart: string,
  periodEnd: string,
  cal: SellingCalendar,
): number {
  return sellingDaysElapsed(periodStart, periodEnd, cal);
}

/** Last COMPLETED selling day strictly before `today` (today is in progress). */
export function lastCompletedSellingDay(today: string, cal: SellingCalendar): string {
  let cur = addDays(today, -1);
  for (let i = 0; i < 10; i++) {
    if (isSellingDay(cur, cal)) return cur;
    cur = addDays(cur, -1);
  }
  return cur;
}
