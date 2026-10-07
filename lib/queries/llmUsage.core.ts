/**
 * Pure helpers for the overview AI usage section (`llmUsage.ts`,
 * `components/tiles/AiUsageSection.tsx`). No I/O, so they unit-test without
 * Supabase.
 */

export type UsageDay = { date: string; calls: number; cost: number | null };

/** YYYY-MM-DD `n` days after `ymd` (negative goes back). Calendar math, no time zone. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * One entry per day from the FIRST recorded day through `todayYmd`, quiet days
 * filled with zero calls. Starting at the first recorded day, not the window
 * start, keeps a ledger that went live yesterday from drawing four weeks of
 * empty bars. A day's cost is null when none of its calls was priced: an
 * unpriced day must not read as a $0 day.
 */
export function buildDailyTrend(
  rows: { day: string; calls: number; cost: number | null }[],
  todayYmd: string,
): UsageDay[] {
  const byDay = new Map<string, { calls: number; cost: number | null }>();
  for (const r of rows) {
    if (r.day > todayYmd) continue;
    const cur = byDay.get(r.day) ?? { calls: 0, cost: null };
    cur.calls += r.calls;
    if (r.cost !== null) cur.cost = (cur.cost ?? 0) + r.cost;
    byDay.set(r.day, cur);
  }
  const first = [...byDay.keys()].sort()[0];
  if (!first) return [];
  const out: UsageDay[] = [];
  for (let d = first; d <= todayYmd; d = addDays(d, 1)) {
    const v = byDay.get(d);
    out.push({ date: d, calls: v?.calls ?? 0, cost: v?.cost ?? null });
  }
  return out;
}

/**
 * Dollars for AI spend. One model call costs a fraction of a cent, so the app's
 * whole-dollar `usd()` reads "$0" for a real day, and `usdExact()` drops the
 * cents when they round to zero ($0.004 → "$0"). Always two decimals, "<$0.01"
 * for a priced amount too small to show, and a dash for unpriced (null).
 */
export function aiUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n > 0 && n < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** "1.8s" / "640ms" / "—". */
export function latencyLabel(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const r = Math.round(ms);
  return r >= 1000 ? `${(r / 1000).toFixed(1)}s` : `${r}ms`;
}
