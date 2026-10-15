/**
 * Plain-English words for /system-health and /incidents — pure, no I/O.
 *
 * The first version of these pages spoke the platform's own language (P1/P2,
 * "shadow", "warn", "lead.not_in_five9", "19:30 ET") and the people who open
 * them on a phone could not read it (the user, 2026-10-15). The codes stay in
 * the database and in URLs; the page shows these words. One module, so the
 * system cards, the incident list and the help text all say the same thing.
 */

import type { HealthColor } from "@/lib/queries/systemStatus.core";

/** Severity codes as words. URL params and the database keep P1..P4. */
export const SEVERITY_WORD: Record<string, string> = { P1: "Urgent", P2: "High", P3: "Medium", P4: "Low" };

export function severityWord(code: string | null | undefined): string {
  if (!code) return "";
  return SEVERITY_WORD[code] ?? code;
}

/** A check result's status as words. */
export const STATUS_WORD: Record<string, string> = {
  pass: "All good",
  warn: "Needs a look",
  fail: "Needs attention",
  unknown: "Can't tell right now",
  skipped: "Not running now",
};

export function statusWord(status: string | null | undefined): string {
  if (!status) return "No result yet";
  return STATUS_WORD[status] ?? status;
}

/** Check families (LP-MCP `health_checks.family`) as headings. */
export const FAMILY_WORD: Record<string, string> = {
  lead: "Leads",
  dialer: "Dialer",
  appointment: "Appointments",
  sync: "Data sync",
  service: "Services",
  workflow: "Automations",
  agent: "AI assistant",
  synthetic: "Test runs",
};

export function familyWord(family: string): string {
  if (FAMILY_WORD[family]) return FAMILY_WORD[family];
  const s = family.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : family;
}

/**
 * A severity badge is shown only when the check needs someone (red or
 * yellow). On a green or grey row "Urgent" read as "something is urgent" when
 * nothing was wrong: the severity is how bad it WOULD be, so it waits until
 * there is something to be bad about.
 */
export function showSeverity(color: HealthColor | string): boolean {
  return color === "red" || color === "yellow";
}

/**
 * A check that cannot run yet: its summary starts "Coming later" (LP-MCP's
 * wording since 2026-10-15) or, from older rows, says "not built yet".
 */
export function isComingLater(summary: string | null | undefined): boolean {
  return !!summary && /^\s*coming later\b|not built yet/i.test(summary);
}

/** The red/yellow count line: "All good", or "2 need attention · 1 needs a look". */
export function attentionLine(counts: { red: number; yellow: number; green?: number }): string {
  const parts: string[] = [];
  if (counts.red) parts.push(`${counts.red} ${counts.red === 1 ? "needs" : "need"} attention`);
  if (counts.yellow) parts.push(`${counts.yellow} ${counts.yellow === 1 ? "needs" : "need"} a look`);
  return parts.length ? parts.join(" · ") : "All good";
}

/** True while every check is in test mode (recorded, no alerts): none is live yet. */
export function allInTestMode(checks: { hollow: boolean }[]): boolean {
  return checks.length > 0 && checks.every((c) => c.hollow);
}

/* ── 24-hour clock → 12-hour clock ───────────────────────────────────── */

function clock(h: number, m: string | null): string {
  const suffix = h < 12 || h === 24 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m !== null ? `:${m}` : ""} ${suffix}`;
}

const HOUR = "([01]?\\d|2[0-3])";
const MIN = "([0-5]\\d)";
// Not after a digit, a colon, a dot, a letter or a slash/dash (dates, ISO stamps, "1/2");
// not followed by more clock digits or an AM/PM already there.
const BEFORE = "(?<![\\w:.\\/-])";
const NOT_12H = "(?![:\\d])(?!\\s*[AaPp]\\.?[Mm]\\b)";

const RANGE_HM = new RegExp(`${BEFORE}${HOUR}:${MIN}\\s*[-–]\\s*${HOUR}:${MIN}${NOT_12H}`, "g");
const RANGE_H_ET = new RegExp(`${BEFORE}${HOUR}\\s*[-–]\\s*([01]?\\d|2[0-4])(?=\\s*ET\\b)`, "g");
const SINGLE_HM = new RegExp(`${BEFORE}${HOUR}:${MIN}${NOT_12H}`, "g");

/**
 * Safety net: any 24-hour clock time in text LP-MCP wrote ("19:30 ET",
 * "08:00-20:00 ET", "hourly 08-20 ET") becomes 12-hour ("7:30 PM ET",
 * "8:00 AM–8:00 PM ET", "hourly 8 AM–8 PM ET"). Dates, money, fractions and
 * counts are left alone. A bare hour range is converted only right before
 * "ET", so "10-16" in a date never reads as a time.
 */
export function plainTimes(text: string): string;
export function plainTimes(text: string | null | undefined): string | null;
export function plainTimes(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return text
    .replace(RANGE_HM, (_, h1: string, m1: string, h2: string, m2: string) => `${clock(Number(h1), m1)}–${clock(Number(h2), m2)}`)
    .replace(RANGE_H_ET, (_, h1: string, h2: string) => `${clock(Number(h1), null)}–${clock(Number(h2), null)}`)
    .replace(SINGLE_HM, (_, h: string, m: string) => clock(Number(h), m));
}
