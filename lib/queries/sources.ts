import { lpServer } from "@/lib/supabase/lp";

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
