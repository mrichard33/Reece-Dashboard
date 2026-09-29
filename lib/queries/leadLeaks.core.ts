/**
 * Pure view-model for /lead-leaks. No I/O, so it tests without a Supabase
 * harness (the `.core.ts` convention used by agent / cohorts / leadsList).
 *
 * The page answers three questions, all from tables LP-MCP's Lead Leak Monitor
 * writes once a day (src/jobs/lead-leak-monitor.js, sql/130 + sql/131):
 *
 *   Which leads have we never called?     lead_leak_daily        (latest run)
 *   How long do leads wait for a call?    lead_call_speed_daily  (per ET day)
 *   Which leads never reached LP at all?  lead_intake_gap_daily  (latest run)
 *
 * FIVE9 IS THE SOURCE OF TRUTH for "was this lead called, and when" — the
 * monitor never reads LP's call counts or call logs. The reason codes and their
 * wording mirror LP-MCP's src/lead-speed-alerts.js REASON_LABELS; keep the two
 * in step, or the Slack card and this page describe one lead two ways.
 */

// ─── Reasons ─────────────────────────────────────────────────────────────────

/** Should have been worked and never was — the page's headline. */
export const LEAK_REASONS = [
  "not_issued_call_center",
  "not_covered_by_rep",
  "rep_hold_expired",
  "routing_or_automation_failure",
  // In Five9, but on no dialing list and never attempted (LP-MCP, 2026-09-29).
  "not_on_dial_list",
  // On a Five9 list, but no call for it in Five9's history (LP-MCP, 2026-09-29).
  "on_list_not_dialed",
  "not_in_five9",
  "unverified",
] as const;

export type LeakReason = (typeof LEAK_REASONS)[number];

export const REASON_LABELS: Record<string, string> = {
  not_issued_call_center: "Not issued to a rep (call center, NIS)",
  not_covered_by_rep: "Not Covered (no rep)",
  rep_hold_expired: "Rep hold over, back in play",
  routing_or_automation_failure: "Never dialled — Five9 has the number",
  not_on_dial_list: "In Five9 but not on any dialing list",
  on_list_not_dialed: "On a Five9 list but no call recorded",
  // Shown on the hourly Slack card only; the daily table does not store it.
  called_no_retry: "Called, no retry since",
  not_in_five9: "Not in Five9 at all",
  unverified: "Not verified — Five9 lookup failed or skipped",
  // Not leaks — shown in the collapsed breakdown.
  rep_hold: "On rep hold (7 days)",
  already_progressed: "Booked/sold, no Five9 call on record",
  already_progressed_flag: "LP appointment flag on, code says otherwise",
  dnc: "Do not call",
  missing_phone: "No usable phone",
  duplicate: "Duplicate of a called lead",
  missing_source: "No lead source",
  data_undecided: "\"Data\" lead — awaiting a ruling",
  dead_status: "Dead status",
  // NOC whose zip is missing or outside the service area — $0, for review (2026-09-28).
  noc_out_of_area: "NOC — out of area (review)",
};

export const isLeak = (reason: string): reason is LeakReason =>
  (LEAK_REASONS as readonly string[]).includes(reason);

// ─── Row shapes (as stored) ──────────────────────────────────────────────────

export type LeakRowRaw = {
  lp_lead_id: string;
  lead_source: string | null;
  disposition: string | null;
  reason: string;
  est_value: number | string | null;
  detail: Record<string, unknown> | null;
};

export type SpeedRowRaw = {
  created_day: string;
  leads: number | string;
  expected: number | string;
  called: number | string;
  never_called: number | string;
  called_1h: number | string;
  called_24h: number | string;
  median_min: number | string | null;
  p90_min: number | string | null;
};

export type IntakeRowRaw = {
  ghl_contact_id: string;
  first_name: string | null;
  last_name: string | null;
  phone10: string | null;
  source: string | null;
  date_added: string | null;
  class: string;
};

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/** "(352) 445-3161" from a 10-digit number; the raw value otherwise. */
export function formatPhone(phone10: string | null | undefined): string {
  if (!phone10) return "—";
  const d = String(phone10).replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(phone10);
}

/** "Jane Doe", or "No name". */
export function fullName(first: unknown, last: unknown): string {
  const name = [s(first), s(last)].filter(Boolean).join(" ").trim();
  return name || "No name";
}

/** "3d 4h" / "5h 12m" / "40m" — how long a lead has been waiting. */
export function formatAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Minutes → "48m" / "1h 36m" / "2d 3h", or "—". */
export const formatMinutes = (m: number | null): string => (m === null ? "—" : formatAge(m * 60000));

// ─── Leads we haven't called ────────────────────────────────────────────────

/**
 * One uncalled lead as the page lists it. `why` is LP-MCP's plain-English
 * sentence (src/lead-leak-explain.js, stored in `detail.why` from the
 * 2026-09-30 run on): which Five9 list it is on, which LP call queue, where a
 * DNC comes from, whether the phone was ever DNC. Asked for 2026-09-29: "we
 * need the reasoning", not just a label. Older rows have none — null, and the
 * page shows the label alone.
 */
export type UncalledLead = {
  lpLeadId: string;
  name: string;
  phone: string;
  source: string;
  disposition: string | null;
  reason: string;
  reasonLabel: string;
  why: string | null;
  estValue: number | null;
  createdAt: string | null;
  waitingMs: number | null;
};

export type LeakLead = UncalledLead & { reason: LeakReason };

/** The uncalled leads that were NOT owed a call, grouped by reason (DNC first). */
export type NotLeakGroup = { reason: string; label: string; leads: UncalledLead[] };

export type LeaksView = {
  leaks: LeakLead[];
  notLeaks: NotLeakGroup[];
  totalLeaks: number;
  valueAtRisk: number;
  byReason: { reason: string; label: string; count: number; leak: boolean }[];
  sources: string[];
  uncalled: number;
};

/**
 * Split a run's rows into the leaks (listed, longest-waiting first) and the
 * not-a-leak breakdown. `createdAt` is `detail.created_utc` — the real instant,
 * already corrected from LP's Eastern-labelled clock by the monitor.
 */
export function shapeLeaks(rows: LeakRowRaw[], nowMs: number): LeaksView {
  const counts = new Map<string, number>();
  const leaks: LeakLead[] = [];
  const notLeakByReason = new Map<string, UncalledLead[]>();
  let valueAtRisk = 0;
  for (const r of rows) {
    counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const lead = toUncalledLead(r, nowMs);
    if (!isLeak(r.reason)) {
      notLeakByReason.set(r.reason, [...(notLeakByReason.get(r.reason) ?? []), lead]);
      continue;
    }
    valueAtRisk += lead.estValue ?? 0;
    leaks.push({ ...lead, reason: r.reason });
  }
  const byWaiting = (a: UncalledLead, b: UncalledLead) => (b.waitingMs ?? -1) - (a.waitingMs ?? -1);
  leaks.sort(byWaiting);
  const notLeaks = [...notLeakByReason.entries()]
    .map(([reason, list]) => ({ reason, label: REASON_LABELS[reason] ?? reason, leads: list.sort(byWaiting) }))
    // DNC first — the question that prompted per-lead reasons (2026-09-29) — then the biggest groups.
    .sort((a, b) => Number(b.reason === "dnc") - Number(a.reason === "dnc") || b.leads.length - a.leads.length);
  const byReason = [...counts.entries()]
    .map(([reason, count]) => ({ reason, label: REASON_LABELS[reason] ?? reason, count, leak: isLeak(reason) }))
    .sort((a, b) => Number(b.leak) - Number(a.leak) || b.count - a.count);
  return {
    leaks,
    notLeaks,
    totalLeaks: leaks.length,
    valueAtRisk: Math.round(valueAtRisk),
    byReason,
    sources: [...new Set(leaks.map((l) => l.source))].sort(),
    uncalled: rows.length,
  };
}

function toUncalledLead(r: LeakRowRaw, nowMs: number): UncalledLead {
  const d = r.detail ?? {};
  const createdAt = s(d.created_utc);
  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  return {
    lpLeadId: String(r.lp_lead_id),
    name: fullName(d.first_name, d.last_name),
    phone: formatPhone(s(d.phone10)),
    source: s(r.lead_source) ?? "(none)",
    disposition: s(r.disposition),
    reason: r.reason,
    reasonLabel: REASON_LABELS[r.reason] ?? r.reason,
    why: s(d.why),
    estValue: n(r.est_value),
    createdAt,
    waitingMs: Number.isFinite(createdMs) ? nowMs - createdMs : null,
  };
}

/** Narrow the leak list by `?reason=` / `?source=`; unknown values match nothing. */
export function filterLeaks(leaks: LeakLead[], f: { reason?: string | null; source?: string | null }): LeakLead[] {
  return leaks.filter((l) => (!f.reason || l.reason === f.reason) && (!f.source || l.source === f.source));
}

// ─── Time to first call ─────────────────────────────────────────────────────

export type SpeedDay = {
  day: string;
  leads: number;
  expected: number;
  called: number;
  neverCalled: number;
  called1h: number;
  called24h: number;
  medianMin: number | null;
  p90Min: number | null;
};

export type SpeedWindow = {
  /** Median of the window's daily medians — the rows hold no per-lead minutes. */
  medianMin: number | null;
  pctCalled1h: number | null;
  pctCalled24h: number | null;
  neverCalled: number;
  expected: number;
  days: number;
};

export type SpeedView = {
  days: SpeedDay[];
  last7: SpeedWindow;
  prior28: SpeedWindow;
  /** Positive = slower than the prior 28 days. */
  deltaMin: number | null;
};

export function mapSpeedRow(r: SpeedRowRaw): SpeedDay {
  return {
    day: String(r.created_day).slice(0, 10),
    leads: n(r.leads) ?? 0,
    expected: n(r.expected) ?? 0,
    called: n(r.called) ?? 0,
    neverCalled: n(r.never_called) ?? 0,
    called1h: n(r.called_1h) ?? 0,
    called24h: n(r.called_24h) ?? 0,
    medianMin: n(r.median_min),
    p90Min: n(r.p90_min),
  };
}

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  const hi = v[mid] ?? 0;
  return v.length % 2 ? hi : ((v[mid - 1] ?? hi) + hi) / 2;
}

function windowOf(days: SpeedDay[]): SpeedWindow {
  const expected = days.reduce((t, d) => t + d.expected, 0);
  const called1h = days.reduce((t, d) => t + d.called1h, 0);
  const called24h = days.reduce((t, d) => t + d.called24h, 0);
  return {
    medianMin: median(days.map((d) => d.medianMin).filter((x): x is number => x !== null)),
    pctCalled1h: expected ? called1h / expected : null,
    pctCalled24h: expected ? called24h / expected : null,
    neverCalled: days.reduce((t, d) => t + d.neverCalled, 0),
    expected,
    days: days.length,
  };
}

/** 'YYYY-MM-DD' shifted by n days. */
export function shiftDay(day: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * 86400000).toISOString().slice(0, 10);
}

/**
 * Last 7 complete ET days vs the 28 before. `todayEt` is excluded from both —
 * today's leads are still being called, so its numbers only ever improve.
 */
export function shapeSpeed(rows: SpeedRowRaw[], todayEt: string): SpeedView {
  const days = rows.map(mapSpeedRow).sort((a, b) => a.day.localeCompare(b.day));
  const last7Start = shiftDay(todayEt, -7);
  const priorStart = shiftDay(last7Start, -28);
  const last7 = windowOf(days.filter((d) => d.day >= last7Start && d.day < todayEt));
  const prior28 = windowOf(days.filter((d) => d.day >= priorStart && d.day < last7Start));
  return {
    days,
    last7,
    prior28,
    deltaMin: last7.medianMin !== null && prior28.medianMin !== null ? last7.medianMin - prior28.medianMin : null,
  };
}

// ─── Never reached LP ───────────────────────────────────────────────────────

export type IntakeContact = {
  ghlContactId: string;
  name: string;
  phone: string;
  source: string;
  dateAdded: string | null;
};

export type IntakeView = {
  missing: IntakeContact[];
  calledAnyway: number;
  unlinked: number;
  checked: number;
};

export function shapeIntake(rows: IntakeRowRaw[]): IntakeView {
  const toContact = (r: IntakeRowRaw): IntakeContact => ({
    ghlContactId: r.ghl_contact_id,
    name: fullName(r.first_name, r.last_name),
    phone: formatPhone(r.phone10),
    source: s(r.source) ?? "(none)",
    dateAdded: s(r.date_added),
  });
  return {
    missing: rows.filter((r) => r.class === "not_in_lp").map(toContact)
      .sort((a, b) => (a.dateAdded ?? "").localeCompare(b.dateAdded ?? "")),
    calledAnyway: rows.filter((r) => r.class === "not_in_lp_but_called").length,
    unlinked: rows.filter((r) => r.class === "in_lp_unlinked").length,
    checked: rows.length,
  };
}
