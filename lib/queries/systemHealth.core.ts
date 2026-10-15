/**
 * /system-health view-model — pure, no I/O.
 *
 * Reads the rows of LP-MCP's `v_health_check_latest` (one per check: its
 * registry row plus its latest result and color) and the last 24h of
 * `health_results`. The clock is passed in: render never reads it.
 *
 * Colors follow the view: no result, or one older than stale_after_min, is red
 * for a P1 and yellow otherwise (silence is never green). A check still in
 * shadow is drawn hollow.
 */

import { SYSTEMS, type HealthColor, type SystemId } from "@/lib/queries/systemStatus.core";
import { isComingLater } from "@/lib/health/words";

export type CheckLatestRaw = {
  check_id: string;
  family: string;
  system: string;
  label: string;
  question: string;
  severity: string;
  cadence: string;
  active_window: string | null;
  stale_after_min: number;
  warn_rule: string;
  fail_rule: string;
  config: Record<string, unknown> | null;
  mode: string;
  owner_job_id: string | null;
  business_impact: string | null;
  enabled: boolean;
  last_status: string | null;
  last_observed_at: string | null;
  last_summary: string | null;
  last_value: number | string | null;
  last_detail?: Record<string, unknown> | null;
  minutes_since: number | string | null;
  color: string;
};

export type CheckView = {
  id: string;
  family: string;
  system: string;
  label: string;
  question: string;
  severity: string;
  cadence: string;
  warnRule: string;
  failRule: string;
  businessImpact: string | null;
  owner: string | null;
  mode: string;
  color: HealthColor;
  hollow: boolean;
  status: string | null;
  summary: string | null;
  value: number | null;
  observedAt: string | null;
  /** "no result for 23 min (expected every 5 min)" when stale or never run. */
  staleNote: string | null;
  /** The check says it is not built yet: drawn grey, "Coming later", never counted as needing a look. */
  comingLater: boolean;
};

export type SystemGroup = {
  id: SystemId;
  label: string;
  color: HealthColor;
  hollow: boolean;
  families: { family: string; checks: CheckView[] }[];
  counts: { red: number; yellow: number; green: number };
};

const asColor = (c: string): HealthColor => (c === "red" || c === "yellow" || c === "green" ? c : "grey");
const RANK: Record<HealthColor, number> = { red: 3, yellow: 2, green: 1, grey: 0 };
export const worst = (a: HealthColor, b: HealthColor): HealthColor => (RANK[a] >= RANK[b] ? a : b);

export function staleNote(r: Pick<CheckLatestRaw, "last_observed_at" | "minutes_since" | "stale_after_min" | "cadence">): string | null {
  if (!r.last_observed_at) return `no result yet (expected ${r.cadence})`;
  const m = Math.round(Number(r.minutes_since));
  if (Number.isFinite(m) && m > r.stale_after_min) return `no result for ${formatMin(m)} (expected ${r.cadence})`;
  return null;
}

export function formatMin(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function toCheckView(r: CheckLatestRaw): CheckView {
  // A check that is not built yet reports "unknown" (yellow in the view). It
  // needs nobody, so it is grey here and never adds to "needs a look"
  // (the user, 2026-10-15).
  const comingLater = isComingLater(r.last_summary);
  const value = r.last_value === null || r.last_value === undefined ? null : Number(r.last_value);
  return {
    id: r.check_id,
    family: r.family,
    system: r.system,
    label: r.label,
    question: r.question,
    severity: r.severity,
    cadence: r.cadence,
    warnRule: r.warn_rule,
    failRule: r.fail_rule,
    businessImpact: r.business_impact,
    owner: r.owner_job_id,
    mode: r.mode,
    color: comingLater ? "grey" : asColor(r.color),
    hollow: r.mode !== "live",
    status: r.last_status,
    summary: r.last_summary,
    value: Number.isFinite(value) ? value : null,
    observedAt: r.last_observed_at,
    staleNote: comingLater ? null : staleNote(r),
    comingLater,
  };
}

/** Eight system groups in fixed order, checks grouped by family, worst color first. */
export function shapeSystems(rows: CheckLatestRaw[]): { systems: SystemGroup[]; counts: { red: number; yellow: number; green: number }; lastEvaluatedAt: string | null } {
  const live = rows.filter((r) => r.enabled !== false && r.color !== "disabled");
  const counts = { red: 0, yellow: 0, green: 0 };
  let last: string | null = null;
  const systems = SYSTEMS.map(({ id, label }) => {
    const mine = live.filter((r) => r.system === id).map(toCheckView);
    const byFamily = new Map<string, CheckView[]>();
    for (const c of mine.sort((a, b) => RANK[b.color] - RANK[a.color] || a.label.localeCompare(b.label))) {
      if (!byFamily.has(c.family)) byFamily.set(c.family, []);
      byFamily.get(c.family)!.push(c);
    }
    const sc = { red: 0, yellow: 0, green: 0 };
    let color: HealthColor = mine.length ? "green" : "grey";
    for (const c of mine) {
      if (c.color === "red" || c.color === "yellow" || c.color === "green") sc[c.color] += 1;
      color = worst(color, c.color);
      if (c.observedAt && (!last || c.observedAt > last)) last = c.observedAt;
    }
    counts.red += sc.red;
    counts.yellow += sc.yellow;
    counts.green += sc.green;
    return {
      id,
      label,
      color,
      hollow: mine.length > 0 && mine.every((c) => c.hollow),
      families: [...byFamily.entries()].map(([family, checks]) => ({ family, checks })),
      counts: sc,
    };
  });
  return { systems, counts, lastEvaluatedAt: last };
}

/* ── 24-hour timeline ─────────────────────────────────────────────────── */

export type ResultRaw = { check_id: string; status: string; observed_at: string; summary?: string | null };
export type Segment = { startMs: number; endMs: number; color: HealthColor };
export type TimelineMeta = Map<string, { system: string; severity: string; label?: string }>;

/**
 * A result that colors the 24-hour bar. A "Coming later" check (not built yet)
 * writes "unknown" every hour; counted, it painted the AI Agents bar yellow all
 * day while every real check was green (the user, 2026-10-15). Pure.
 */
function barColor(r: ResultRaw, severity: string): HealthColor | null {
  if (isComingLater(r.summary)) return null;
  return resultColor(r.status, severity);
}

/** One result's color, by the view's rule. Skipped results do not color a bucket. Pure. */
export function resultColor(status: string, severity: string): HealthColor | null {
  if (status === "skipped") return null;
  if (status === "fail") return severity === "P1" || severity === "P2" ? "red" : "yellow";
  if (status === "warn" || status === "unknown") return "yellow";
  if (status === "pass") return "green";
  return null;
}

/**
 * Per system: the last 24h in buckets (30 min), each the worst color any of its
 * checks reported in that bucket; grey where nothing reported. Pure.
 */
export function buildTimelines(
  results: ResultRaw[],
  meta: TimelineMeta,
  nowMs: number,
  bucketMin = 30,
): Record<string, Segment[]> {
  const bucketMs = bucketMin * 60_000;
  const start = nowMs - 24 * 3_600_000;
  const n = Math.ceil((nowMs - start) / bucketMs);
  const out: Record<string, Segment[]> = {};
  for (const { id } of SYSTEMS) {
    out[id] = Array.from({ length: n }, (_, i) => ({ startMs: start + i * bucketMs, endMs: Math.min(nowMs, start + (i + 1) * bucketMs), color: "grey" as HealthColor }));
  }
  for (const r of results) {
    const m = meta.get(r.check_id);
    if (!m || !out[m.system]) continue;
    const t = Date.parse(r.observed_at);
    if (!Number.isFinite(t) || t < start || t > nowMs) continue;
    const c = barColor(r, m.severity);
    if (!c) continue;
    const i = Math.min(n - 1, Math.floor((t - start) / bucketMs));
    const seg = out[m.system]?.[i];
    if (seg) seg.color = seg.color === "grey" ? c : worst(seg.color, c);
  }
  return out;
}

/** What turned a system's bar red or yellow: one line per check. */
export type TimelineProblem = {
  checkId: string;
  label: string;
  color: HealthColor;
  /** Bad results in the window, and the first and last of them (ms). */
  times: number;
  firstMs: number;
  lastMs: number;
  lastSummary: string | null;
};

/**
 * Per system: the checks that were red or yellow in the last 24h, worst and
 * then most recent first, so a person can see WHAT the bar's red block was
 * (the user, 2026-10-15: "the bar shows red while every agent check is green").
 * Same results and rules as buildTimelines. Pure.
 */
export function timelineProblems(results: ResultRaw[], meta: TimelineMeta, nowMs: number): Record<string, TimelineProblem[]> {
  const start = nowMs - 24 * 3_600_000;
  const byCheck = new Map<string, TimelineProblem & { system: string }>();
  for (const r of results) {
    const m = meta.get(r.check_id);
    if (!m) continue;
    const t = Date.parse(r.observed_at);
    if (!Number.isFinite(t) || t < start || t > nowMs) continue;
    const c = barColor(r, m.severity);
    if (c !== "red" && c !== "yellow") continue;
    const p = byCheck.get(r.check_id);
    if (!p) {
      byCheck.set(r.check_id, { system: m.system, checkId: r.check_id, label: m.label || r.check_id, color: c, times: 1, firstMs: t, lastMs: t, lastSummary: r.summary ?? null });
      continue;
    }
    p.times += 1;
    p.color = worst(p.color, c);
    if (t < p.firstMs) p.firstMs = t;
    if (t >= p.lastMs) { p.lastMs = t; p.lastSummary = r.summary ?? p.lastSummary; }
  }
  const out: Record<string, TimelineProblem[]> = {};
  for (const { system, ...p } of byCheck.values()) (out[system] ??= []).push(p);
  for (const list of Object.values(out)) list.sort((a, b) => RANK[b.color] - RANK[a.color] || b.lastMs - a.lastMs);
  return out;
}

/* ── one check's detail page ─────────────────────────────────────────── */

export type ResultPoint = { at: string; value: number | null; status: string; summary: string | null };

/**
 * The warn and fail lines to draw on a check's chart: the first numeric
 * warn_* / fail_* pair in its config with the same suffix. Pure.
 */
export function thresholdLines(config: Record<string, unknown> | null): { warn: number | null; fail: number | null; key: string | null } {
  if (!config) return { warn: null, fail: null, key: null };
  const keys = Object.keys(config);
  for (const k of keys) {
    const m = /^warn(_.+)?$/.exec(k);
    if (!m) continue;
    const suffix = m[1] ?? "";
    const w = Number(config[k]);
    const f = Number(config[`fail${suffix}`]);
    if (Number.isFinite(w) || Number.isFinite(f)) {
      return { warn: Number.isFinite(w) ? w : null, fail: Number.isFinite(f) ? f : null, key: suffix ? suffix.slice(1) : "count" };
    }
  }
  return { warn: null, fail: null, key: null };
}

/** Lead and dialer checks link to /lead-leaks (filtered), not a copy of it. */
export function leadLeaksLink(checkId: string): string | null {
  const reasons: Record<string, string> = {
    "lead.not_in_five9": "not_in_five9",
    "lead.in_inbound_queue": "in_inbound_queue",
    "lead.routing_failure": "routing_or_automation_failure",
  };
  if (reasons[checkId]) return `/lead-leaks?reason=${reasons[checkId]}`;
  if (checkId.startsWith("lead.") || checkId.startsWith("dialer.")) return "/lead-leaks";
  return null;
}
