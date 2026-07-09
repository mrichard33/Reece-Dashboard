import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "America/New_York";

export function relTime(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function absTime(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return formatInTimeZone(date, TZ, "yyyy-MM-dd HH:mm:ss zzz");
}

export function shortDate(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d");
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Full US date MM-DD-YYYY for a `YYYY-MM-DD` string (the scorecard house style —
 * badges, banners, tooltips). Parses the calendar date directly (no TZ shift, so
 * an ET selling-day string never slips to the prior day). Falls back to date-fns
 * for Date/epoch inputs.
 */
export function usDate(input: string | Date | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const [y, m, d] = input.slice(0, 10).split("-");
    return `${m}-${d}-${y}`;
  }
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MM-dd-yyyy");
}

/** Spelled month label "June 2026" for a `YYYY-MM` or `YYYY-MM-DD` string. */
export function monthLabelFull(ym: string | null | undefined): string {
  if (!ym || !/^\d{4}-\d{2}/.test(ym)) return "—";
  const [y, m] = ym.split("-");
  return `${MONTHS_FULL[Number(m) - 1] ?? m} ${y}`;
}

export function num(n: number | null | undefined, fallback = "—"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return fallback;
  return new Intl.NumberFormat("en-US").format(n);
}

export function usd(n: number | null | undefined, fallback = "—"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return fallback;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function minutesSince(input: Date | string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 60000);
}
