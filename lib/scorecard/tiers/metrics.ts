/**
 * Metric primitives shared by all five tiers.
 *
 * Two rules are enforced here rather than left to each call site:
 *
 *  1. RATIO OF SUMS, NEVER AN AVERAGE OF RATIOS. Orlando's issue rate is
 *     (ORL issued + LAKE issued) ÷ (ORL leads + LAKE leads) — averaging the two
 *     offices' rates weights a 200-lead office the same as a 6,000-lead one and
 *     produces a number that belongs to neither.
 *  2. A ZERO DENOMINATOR IS NOT A ZERO RATE. It is an unmeasurable one, and it
 *     returns `unmeasured` with a reason so the cell can say why.
 */
import { measured, unmeasured, type Measured } from "./types";

/** Percent (0–100, 1dp) as a ratio of sums. */
export function rate(numerator: number, denominator: number, what = "rate"): Measured {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return unmeasured(`${what} not computable — inputs missing`);
  }
  if (denominator <= 0) return unmeasured(`${what} not computable — no volume in the denominator`);
  return measured(Math.round((numerator / denominator) * 1000) / 10);
}

/** Dollars-per-unit (whole dollars) as a ratio of sums. */
export function perUnit(dollars: number, units: number, what = "unit cost"): Measured {
  if (!Number.isFinite(dollars) || !Number.isFinite(units)) {
    return unmeasured(`${what} not computable — inputs missing`);
  }
  if (units <= 0) return unmeasured(`${what} not computable — no units in the denominator`);
  return measured(Math.round((dollars / units) * 100) / 100);
}

/** Percentage-point gap, actual − target. Null-safe on either side. */
export function pointsGap(actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  return Math.round((actual - target) * 10) / 10;
}

// ── Time-to-Net ─────────────────────────────────────────────────────────────

/**
 * Time-to-Net = RTP date − contract date, in days.
 *
 * WHY IT MATTERS: it is the only thing that distinguishes a $27M leak that is
 * PERMANENT LOSS from one that is SLOW RECOGNITION. A market with a long right
 * tail has a workflow problem (jobs sitting in a queue); a market with genuine
 * cancellations has a sales-quality problem. Today those two are indistinguish-
 * able on the page, so the same intervention gets aimed at both.
 *
 * SOURCE CORRECTION (verified 2026-08-05): the handoff specifies `NETDATE −
 * contractdate` from `job_status_ytd`. That report's snapshot persists 940 rows
 * in `row_count` but ZERO job-level rows in `scorecard_report_rows_a/_b` — only
 * aggregated facts survived ingest, and facts carry no per-job dates. The job-
 * level dates that DO exist are `contract_date` + `rtp_date` on
 * `scorecard_report_rows_a` (the Jobs-by-Milestone rows), which is the same
 * quantity under LP's other name for it. That is what this computes, and the
 * sample it rests on is reported honestly rather than presented as YTD.
 */
export type JobDateRow = {
  job_number: string | null;
  market: string;
  contract_date: string | null;
  rtp_date: string | null;
};

export type TimeToNetStat = {
  market: string;
  /** Distinct jobs behind the figure — the honesty column. */
  n: number;
  medianDays: Measured;
  p75Days: Measured;
  maxDays: Measured;
};

/** Whole days between two YYYY-MM-DD calendar dates (UTC-safe, no TZ drift). */
export function daysBetween(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(from) || !/^\d{4}-\d{2}-\d{2}/.test(to)) return null;
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/**
 * Linear-interpolated percentile, matching Postgres `percentile_cont` so the
 * dashboard and an ad-hoc SQL check agree to the decimal.
 */
export function percentileCont(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return Math.round((sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)) * 100) / 100;
}

/** Minimum distinct jobs before a market's median is worth publishing. */
export const TTN_MIN_SAMPLE = 3;

/**
 * Median + p75 Time-to-Net per display market, plus a company row.
 *
 * DEDUPLICATION IS MANDATORY. The same 30 jobs appear across seven re-ingested
 * snapshots (214 rows / 30 distinct job numbers, verified 2026-08-05); counting
 * rows instead of jobs would 7× the sample and report a fabricated confidence.
 * Jobs are deduped by job_number, keeping the latest RTP date seen.
 */
export function timeToNetByMarket(
  rows: readonly JobDateRow[],
  displayMarketOf: (m: string) => string,
): { markets: TimeToNetStat[]; company: TimeToNetStat } {
  const byJob = new Map<string, { market: string; days: number }>();
  for (const r of rows) {
    if (!r.job_number || !r.contract_date || !r.rtp_date) continue;
    const days = daysBetween(r.contract_date, r.rtp_date);
    if (days == null || days < 0) continue;
    const prev = byJob.get(r.job_number);
    // Latest RTP wins — a re-ingested snapshot may carry a corrected date.
    if (prev && prev.days >= days) continue;
    byJob.set(r.job_number, { market: displayMarketOf(r.market), days });
  }

  const buckets = new Map<string, number[]>();
  const all: number[] = [];
  for (const { market, days } of byJob.values()) {
    const b = buckets.get(market);
    if (b) b.push(days);
    else buckets.set(market, [days]);
    all.push(days);
  }

  const stat = (market: string, days: number[]): TimeToNetStat => {
    const sorted = [...days].sort((a, b) => a - b);
    const thin = `sample too thin — ${sorted.length} job${sorted.length === 1 ? "" : "s"} (need ${TTN_MIN_SAMPLE})`;
    const usable = sorted.length >= TTN_MIN_SAMPLE;
    return {
      market,
      n: sorted.length,
      medianDays: usable ? measured(percentileCont(sorted, 0.5)!) : unmeasured(thin),
      p75Days: usable ? measured(percentileCont(sorted, 0.75)!) : unmeasured(thin),
      maxDays: usable ? measured(sorted[sorted.length - 1]!) : unmeasured(thin),
    };
  };

  return {
    markets: [...buckets.entries()]
      .map(([m, d]) => stat(m, d))
      .sort((a, b) => a.market.localeCompare(b.market)),
    company: stat("REECE", all),
  };
}
