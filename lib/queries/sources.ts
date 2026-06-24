import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { fetchScorecardPreview } from "@/lib/queries/scorecard";

/**
 * Source Performance read layer (Phase 2).
 *
 * The LP-MCP daily job writes one ACTUALS row per (market, source, sub_source,
 * as_of_date) into lp_source_scorecard_daily, computed from the SAME prospect set
 * and the SAME definitions as the aggregate scorecard (released/working/cancel,
 * By Appt Date). This reads the latest snapshot for a market.
 *
 * ⚠ TIE-OUT: per-source figures inherit the same provisional status as the
 * aggregate until reconciled. Postgres numeric(...) arrives as strings over
 * PostgREST, so every money/ratio field is coerced to number | null here.
 */

export type SourceScorecardRow = {
  source: string;
  sub_source: string;
  bucket: string | null;
  unmapped: boolean;
  leads: number;
  sets: number;
  issued: number;
  net_issue: number;
  demos: number;
  sales: number;
  net_close: number;
  ko_count: number;
  gross_sales: number | null;
  net_sales: number | null;
  released_dollars: number | null;
  working_dollars: number | null;
  pending_total: number | null;
  pct_issue: number | null;
  demo_pct: number | null;
  close_pct: number | null;
  pct_net_close: number | null;
  good_rate_pct: number | null;
  ko_pct: number | null;
  gsli: number | null;
  nsli: number | null;
  avg_sale: number | null;
};

export type SourceScorecardView = {
  as_of_date: string;
  period_start: string | null;
  period_end: string | null;
  rows: SourceScorecardRow[];
  /** Sources in the snapshot that don't resolve through lp_source_mapping. */
  unmapped_count: number;
};

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function i(v: unknown): number {
  return n(v) ?? 0;
}

function mapRow(r: Record<string, unknown>): SourceScorecardRow {
  const raw = (r.raw_inputs as Record<string, unknown> | null) ?? {};
  return {
    source: String(r.source ?? "(none)"),
    sub_source: String(r.sub_source ?? "(none)"),
    bucket: raw.bucket != null ? String(raw.bucket) : null,
    unmapped: raw.unmapped === true,
    leads: i(r.leads),
    sets: i(r.sets),
    issued: i(r.issued),
    net_issue: i(r.net_issue),
    demos: i(r.demos),
    sales: i(r.sales),
    net_close: i(r.net_close),
    ko_count: i(r.ko_count),
    gross_sales: n(r.gross_sales),
    net_sales: n(r.net_sales),
    released_dollars: n(r.released_dollars),
    working_dollars: n(r.working_dollars),
    pending_total: n(r.pending_total),
    pct_issue: n(r.pct_issue),
    demo_pct: n(r.demo_pct),
    close_pct: n(r.close_pct),
    pct_net_close: n(r.pct_net_close),
    good_rate_pct: n(r.good_rate_pct),
    ko_pct: n(r.ko_pct),
    gsli: n(r.gsli),
    nsli: n(r.nsli),
    avg_sale: n(r.avg_sale),
  };
}

/**
 * Per-source actuals for the latest snapshot on/just before `asOf` (defaults to
 * the most recent). Returns null when no source rows exist yet (job hasn't run
 * the Phase 2 path, or the table is empty).
 */
export async function getSourceScorecard(
  market = "REECE",
  asOf?: string,
): Promise<SourceScorecardView | null> {
  const sb = await lpServer();

  // Find the latest snapshot date for this market (rows share one as_of_date).
  let dq = sb
    .from("lp_source_scorecard_daily")
    .select("as_of_date")
    .eq("market", market)
    .order("as_of_date", { ascending: false })
    .limit(1);
  if (asOf) dq = dq.lte("as_of_date", asOf);
  const { data: dateRows, error: dateErr } = await dq;
  if (dateErr) throw dateErr;
  const asOfDate = (dateRows?.[0] as { as_of_date?: string } | undefined)?.as_of_date;
  if (!asOfDate) return null;

  const { data, error } = await sb
    .from("lp_source_scorecard_daily")
    .select("*")
    .eq("market", market)
    .eq("as_of_date", asOfDate);
  if (error) throw error;

  const raw = (data ?? []) as Record<string, unknown>[];
  const rows = raw.map(mapRow);
  const unmapped_count = rows.filter((r) => r.unmapped).length;
  const period_start = raw[0]?.period_start ? String(raw[0].period_start) : null;
  const period_end = raw[0]?.period_end ? String(raw[0].period_end) : null;
  return { as_of_date: asOfDate, period_start, period_end, rows, unmapped_count };
}

function rate(numr: number, den: number): number | null {
  if (!den) return null;
  return Math.round((numr / den) * 1000) / 10;
}
function money(numr: number, den: number): number | null {
  if (!den) return null;
  return Math.round(numr / den);
}

/**
 * Aggregate stored per-source snapshots over a multi-month range: latest snapshot
 * per (source, sub_source, month) → sum numerators → re-derive ratios (mirrors
 * scorecardAggregate). Pure, for the "aggregate" sourcing path.
 */
function aggregateSourceRows(raw: Record<string, unknown>[]): SourceScorecardRow[] {
  // key = source|sub_source|period_start → latest snapshot for that month
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of raw) {
    const key = `${r.source}|${r.sub_source}|${r.period_start}`;
    const prev = latest.get(key);
    if (!prev || String(r.as_of_date) > String(prev.as_of_date)) latest.set(key, r);
  }
  // Group the monthly-latest rows by (source, sub_source) and sum.
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of latest.values()) {
    const key = `${r.source}|${r.sub_source}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const out: SourceScorecardRow[] = [];
  for (const months of groups.values()) {
    const first = months[0];
    if (!first) continue;
    const fraw = (first.raw_inputs as Record<string, unknown> | null) ?? {};
    const sum = (f: string) => months.reduce((a, r) => a + i(r[f]), 0);
    const issued = sum("issued");
    const sets = sum("sets");
    const net_issue = sum("net_issue");
    const demos = sum("demos");
    const sales = sum("sales");
    const net_close = sum("net_close");
    const ko_count = sum("ko_count");
    const gross_sales = sum("gross_sales");
    const released_dollars = sum("released_dollars");
    out.push({
      source: String(first.source ?? "(none)"),
      sub_source: String(first.sub_source ?? "(none)"),
      bucket: fraw.bucket != null ? String(fraw.bucket) : null,
      unmapped: fraw.unmapped === true,
      leads: sum("leads"),
      sets,
      issued,
      net_issue,
      demos,
      sales,
      net_close,
      ko_count,
      gross_sales,
      net_sales: released_dollars,
      released_dollars,
      working_dollars: sum("working_dollars"),
      pending_total: sum("working_dollars"),
      pct_issue: rate(issued, sets),
      demo_pct: rate(demos, net_issue),
      close_pct: rate(sales, demos),
      pct_net_close: rate(net_close, demos),
      good_rate_pct: rate(released_dollars, gross_sales),
      ko_pct: rate(ko_count, sales),
      gsli: money(gross_sales, issued),
      nsli: money(released_dollars, issued),
      avg_sale: money(released_dollars, net_close),
    });
  }
  return out;
}

/**
 * Period-aware per-source actuals. snapshot → stored latest; recompute → the
 * preview route's `sources` (cached, no extra LP pull); aggregate → sum stored
 * monthly per-source snapshots with ratios re-derived.
 */
export async function getSourceScorecardForPeriod(
  market: string,
  resolved: ResolvedPeriod,
): Promise<SourceScorecardView | null> {
  if (resolved.source === "snapshot") {
    return getSourceScorecard(market, resolved.asOf);
  }

  if (resolved.source === "recompute") {
    const preview = await fetchScorecardPreview(market, resolved);
    if (!preview) return null;
    const rows = preview.sources.map(mapRow);
    return {
      as_of_date: resolved.asOf,
      period_start: resolved.periodStart,
      period_end: resolved.periodEnd,
      rows,
      unmapped_count: rows.filter((r) => r.unmapped).length,
    };
  }

  // aggregate
  const sb = await lpServer();
  const { data, error } = await sb
    .from("lp_source_scorecard_daily")
    .select("*")
    .eq("market", market)
    .gte("period_start", resolved.periodStart)
    .lte("period_start", resolved.periodEnd);
  if (error) throw error;
  const raw = (data ?? []) as Record<string, unknown>[];
  if (!raw.length) return null;
  const rows = aggregateSourceRows(raw);
  return {
    as_of_date: resolved.asOf,
    period_start: resolved.periodStart,
    period_end: resolved.periodEnd,
    rows,
    unmapped_count: rows.filter((r) => r.unmapped).length,
  };
}
