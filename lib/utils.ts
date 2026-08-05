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

/**
 * THE number formatter. Every displayed figure on the dashboard goes through
 * `num` or `usd` (ruled 2026-08-05 §6) — thousands separators are not a
 * per-component decision, and a raw `{value}` or `.toLocaleString()` in JSX is
 * a bug, not a style choice.
 */
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

/** Currency WITH cents when the figure has them (goals, control totals). */
export function usdExact(n: number | null | undefined, fallback = "—"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return fallback;
  const cents = Math.abs(Math.round(n * 100) % 100) > 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

/**
 * Parse a money figure a human typed: "2,731,306.68", "$2,731,306.68",
 * " 2731306.68 " all mean the same amount. Returns null for blank or
 * unparseable input so a caller can tell "not entered" from zero.
 *
 * Rounded to the cent — 2731306.68 must store as 2731306.68, not as the
 * float artifact 2731306.6800000002.
 */
export function parseMoney(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/^\+/, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Format a money figure for an INPUT field: comma-grouped, cents kept only
 * when present, no currency symbol (the field renders its own "$" prefix).
 */
export function formatMoneyInput(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  const cents = Math.abs(Math.round(n * 100) % 100) > 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function minutesSince(input: Date | string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 60000);
}
