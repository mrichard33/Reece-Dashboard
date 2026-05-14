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
