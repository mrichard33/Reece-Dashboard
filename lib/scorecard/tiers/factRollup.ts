/**
 * Fact rollup — ONE row per (snapshot, market, metric, bucket).
 *
 * THE DEFECT THIS FIXES (verified live 2026-08-05): `lp_report_facts` stores one
 * row per BRANCH, not per market. Fort Lauderdale's Lead Disposition leads are
 * split across five rows —
 *
 *     FTLAU 3,181 + BOCA 5,427 + MIAMI 1,608 + RFED 286 + (null) 29 = 10,531
 *
 * — and its Sales Efficiency YTD facts occupy 32 rows where every other market
 * has 8. Any read that does not sum across branch rows under-reports Fort
 * Lauderdale by ~70%. Requiring every call site to remember to sum is how that
 * bug recurs; the fix is structural: fact rows are rolled up ONCE, at the edge,
 * and nothing downstream ever sees a branch row.
 *
 * The rollup also collapses market codes onto display entities (OUT_OF_AREA →
 * UNASSIGNED), so `DISTINCT market` over rolled-up rows returns exactly the
 * SEVEN markets + UNASSIGNED.
 *
 * Lakeland is one of the seven. This comment used to say LAKE_MKT folded into
 * ORL_MKT and that Lakeland had no display identity; the 2026-08-06 ruling
 * reversed that fold and the code followed, but the comment did not — see
 * markets.ts for the standing rule.
 *
 * SNAPSHOT IDENTITY: fact rows do not carry `snapshot_id`, but
 * (period_start, period_end, as_of_date, scope) separates any two
 * simultaneously-current snapshots of one report type — which is the state the
 * scope fix deliberately created (an MTD and a YTD Sales Efficiency pull are
 * two different reports about two different windows, not two versions of one).
 * Rolling up WITHIN that key is the safe operation; rolling up ACROSS it would
 * double-count the moment two windows share a period_start.
 */
import { displayMarketOf } from "@/lib/scorecard/markets";
import type { FactScope, ReportFactRow } from "@/lib/queries/reportFacts.core";

/** A fact after rollup: exactly one per (snapshot, market, metric, bucket). */
export type RolledFact = {
  report_type: string;
  period_start: string;
  period_end: string;
  as_of_date: string;
  scope: FactScope | null;
  /** Display market — LAKE_MKT and OUT_OF_AREA are already collapsed away. */
  market: string;
  metric: string;
  bucket: string | null;
  /** Σ across the branch rows. Null only when NO contributing row had cents. */
  value_cents: number | null;
  value_count: number;
  /** How many raw fact rows folded into this one — the footing audit trail. */
  sourceRows: number;
};

/** Stable identity of the snapshot a fact row came from. */
export const snapshotKeyOf = (f: {
  period_start: string;
  period_end: string;
  as_of_date: string;
  scope?: FactScope | null;
}) => `${f.period_start}|${f.period_end}|${f.as_of_date}|${f.scope ?? ""}`;

const rollupKeyOf = (f: ReportFactRow) =>
  `${f.report_type}|${snapshotKeyOf(f)}|${displayMarketOf(f.market)}|${f.metric}|${f.bucket ?? ""}`;

/**
 * Fold raw fact rows into one row per (snapshot, market, metric, bucket).
 *
 * `value_cents` stays null when no contributing row carried cents (a count-only
 * metric like `issued`), and becomes a sum the moment any row does — so a
 * count-only metric never fabricates $0, and a money metric never loses a
 * branch's dollars.
 */
export function rollupFacts(rows: readonly ReportFactRow[]): RolledFact[] {
  const out = new Map<string, RolledFact>();
  for (const r of rows) {
    const key = rollupKeyOf(r);
    const prev = out.get(key);
    if (prev) {
      prev.value_count += r.value_count;
      if (r.value_cents != null) prev.value_cents = (prev.value_cents ?? 0) + r.value_cents;
      prev.sourceRows += 1;
      continue;
    }
    out.set(key, {
      report_type: r.report_type,
      period_start: r.period_start,
      period_end: r.period_end,
      as_of_date: r.as_of_date,
      scope: r.scope ?? null,
      market: displayMarketOf(r.market),
      metric: r.metric,
      bucket: r.bucket ?? null,
      value_cents: r.value_cents ?? null,
      value_count: r.value_count,
      sourceRows: 1,
    });
  }
  return [...out.values()];
}

/**
 * Pick ONE snapshot of a report type out of rolled facts.
 *
 * Preference: the requested scope, then the freshest as-of, then the tightest
 * window. Summing across snapshots is never correct — two current snapshots are
 * two reports, not two halves of one.
 */
export function pickSnapshot(
  rows: readonly RolledFact[],
  reportType: string,
  wantScope: FactScope,
): RolledFact[] {
  const candidates = rows.filter((r) => r.report_type === reportType);
  if (!candidates.length) return [];
  const groups = new Map<string, RolledFact[]>();
  for (const r of candidates) {
    const k = snapshotKeyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const ranked = [...groups.values()].sort((a, b) => {
    const sa = a[0]!.scope === wantScope ? 0 : 1;
    const sb = b[0]!.scope === wantScope ? 0 : 1;
    if (sa !== sb) return sa - sb;
    if (a[0]!.as_of_date !== b[0]!.as_of_date) return a[0]!.as_of_date < b[0]!.as_of_date ? 1 : -1;
    return a[0]!.period_end < b[0]!.period_end ? -1 : 1;
  });
  const best = ranked[0]!;
  // Fail closed: never answer a scope question with the wrong scope silently.
  return best[0]!.scope === wantScope ? best : [];
}

/** Σ count/cents for a metric within already-picked snapshot rows. */
export function sumMetric(
  rows: readonly RolledFact[],
  metric: string,
  opts: { market?: string; bucket?: string | null } = {},
): { seen: boolean; count: number; cents: number | null } {
  let count = 0;
  let cents: number | null = null;
  let seen = false;
  for (const r of rows) {
    if (r.metric !== metric) continue;
    if (opts.market && r.market !== opts.market) continue;
    if (opts.bucket !== undefined && (r.bucket ?? null) !== opts.bucket) continue;
    seen = true;
    count += r.value_count;
    if (r.value_cents != null) cents = (cents ?? 0) + r.value_cents;
  }
  return { seen, count, cents };
}

/** Rolled rows for one display market, or all of them for the company. */
export function forMarket(rows: readonly RolledFact[], marketCode: string): RolledFact[] {
  if (!marketCode || marketCode === "REECE") return [...rows];
  return rows.filter((r) => r.market === marketCode);
}

/** Display markets actually present in a set of rolled rows, in stable order. */
export function marketsPresent(rows: readonly RolledFact[]): string[] {
  return [...new Set(rows.map((r) => r.market))].sort();
}

/** Cents → dollars, preserving null (never coerce absence to zero). */
export const dollarsOf = (cents: number | null | undefined): number | null =>
  cents == null ? null : cents / 100;
