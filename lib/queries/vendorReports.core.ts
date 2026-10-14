/**
 * Pure helpers for /vendor-reports (2026-10-14). No I/O, so they unit-test
 * without Supabase. The data model is LP-MCP / n8n's `vdr_vendor_config`
 * (one row per lead vendor) and `vdr_send_log` (one row per vendor per
 * attempt), owned by the n8n "06 VDR Weekly Vendor Disposition Report"
 * workflow. The workflow reads the config table every hour, so a change
 * saved here takes effect on the next run with no workflow edit.
 */

export type VendorConfigRow = {
  id: number;
  vendor_name: string;
  lp_sub_sources: string[];
  recipients_to: string[];
  recipients_cc: string[];
  send_dow: number;
  send_time: string;
  timezone: string;
  lookback_days: number;
  is_active: boolean;
  dry_run: boolean;
  rev_share: boolean;
  notes: string | null;
  updated_at: string;
};

export type SendLogRow = {
  id: number;
  vendor_id: number | null;
  vendor_name: string;
  week_start: string;
  status: "sent" | "failed" | "blocked" | "empty";
  lead_count: number | null;
  reason: string | null;
  dry_run: boolean;
  attempted_at: string;
};

export type VendorLastRun = {
  status: SendLogRow["status"];
  leadCount: number | null;
  reason: string | null;
  dryRun: boolean;
  attemptedAt: string;
};

export type VendorItem = VendorConfigRow & { lastRun: VendorLastRun | null };

export type VendorReportsPageData = {
  items: VendorItem[];
  needsMigration: boolean;
  errors: Record<string, string>;
};

/** The n8n repo file that creates the tables, named when they are missing. */
export const VDR_MIGRATION = "mrichard33/n8n sql/vdr_vendor_disposition_report.sql";

const DOW = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * "Mondays, when the LP feed arrives". The workflow runs when the daily LP feed
 * email lands (one Gmail trigger, no timer, 2026-10-14); send_time is only the
 * earliest point in the week a vendor counts as due (00:00), so the clock time
 * is not shown: it read as "sends at midnight" and it does not.
 */
export function scheduleLabel(r: Pick<VendorConfigRow, "send_dow" | "send_time" | "timezone">): string {
  const day = DOW[r.send_dow] ?? `day ${r.send_dow}`;
  return `${day}s, when the LP feed arrives`;
}

export function formatSubSources(list: string[] | null | undefined): string {
  return (list ?? []).join(", ");
}

/** MM-DD-YYYY in Eastern time (Mark, 2026-10-14: every date a person reads). */
export function formatDateMdy(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}-${get("day")}-${get("year")}`;
}

const EMAIL_RX = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Parse what a person typed into the email box: commas, semicolons, spaces
 * and new lines all separate. Lower-cased and de-duplicated. Anything that is
 * not shaped like an address comes back in `invalid` so the form can say which.
 */
export function parseEmails(text: string): { emails: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of String(text ?? "").split(/[\s,;]+/)) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if (!EMAIL_RX.test(v)) {
      invalid.push(raw.trim());
      continue;
    }
    if (!seen.has(v)) {
      seen.add(v);
      emails.push(v);
    }
  }
  return { emails, invalid };
}

export function formatEmails(list: string[] | null | undefined): string {
  return (list ?? []).join(", ");
}

/** Parse the LP sub-source list typed for a new vendor (comma or new line). */
export function parseSubSources(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/[\n,]+/)) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const k = v.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Newest log row per vendor id (the input may be in any order). */
export function latestRunByVendor(rows: SendLogRow[]): Map<number, VendorLastRun> {
  const out = new Map<number, VendorLastRun>();
  const best = new Map<number, SendLogRow>();
  for (const r of rows) {
    if (r.vendor_id == null) continue;
    const cur = best.get(r.vendor_id);
    if (!cur || r.id > cur.id) best.set(r.vendor_id, r);
  }
  for (const [id, r] of best) {
    out.set(id, {
      status: r.status,
      leadCount: r.lead_count,
      reason: r.reason,
      dryRun: r.dry_run,
      attemptedAt: r.attempted_at,
    });
  }
  return out;
}

/** Active vendors first, then by name; the inactive rows sit at the bottom. */
export function sortVendors<T extends Pick<VendorConfigRow, "is_active" | "vendor_name">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.vendor_name.localeCompare(b.vendor_name);
  });
}

export function toItems(config: VendorConfigRow[], log: SendLogRow[]): VendorItem[] {
  const last = latestRunByVendor(log);
  return sortVendors(config).map((c) => ({ ...c, lastRun: last.get(c.id) ?? null }));
}

/** One line a person can read: "Sent (dry run) · 5,438 leads · 10-19-2026". */
export function lastRunLabel(run: VendorLastRun | null): string {
  if (!run) return "Never run";
  const date = formatDateMdy(run.attemptedAt);
  const word = { sent: "Sent", failed: "Failed", blocked: "Blocked", empty: "No leads" }[run.status] ?? run.status;
  const parts = [`${word}${run.status === "sent" && run.dryRun ? " (dry run)" : ""}`];
  if (run.leadCount != null && run.status === "sent") parts.push(`${run.leadCount.toLocaleString("en-US")} leads`);
  if (run.status === "blocked" || run.status === "failed") {
    const why = String(run.reason ?? "").split(" (")[0];
    if (why) parts.push(why);
  }
  if (date) parts.push(date);
  return parts.join(" · ");
}

/** What a vendor's emails will do on the next run, in plain words. */
export function deliveryLabel(r: Pick<VendorConfigRow, "is_active" | "dry_run" | "recipients_to">): string {
  if (!r.is_active) return "Off: no report is sent.";
  if (r.dry_run) return "Dry run: the report goes to Mark only, marked [DRY RUN].";
  if (r.recipients_to.length === 0) return "Live but no email on file: the run will block with no_recipients.";
  return `Live: sent to ${r.recipients_to.join(", ")} with Mark in BCC.`;
}
