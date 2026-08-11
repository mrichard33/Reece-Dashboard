import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { buildReportFacts, type ReportFactRow, type ReportFacts } from "./reportFacts.core";

/**
 * Fetch the current CSV-era report facts (source_cost / lead_disposition /
 * job_status_ytd) and project them for one dashboard market. Read-only,
 * RLS-respecting (lp_report_facts_read policy, authenticated). A fetch
 * failure returns nulls — the cards render "not yet sourced", never $0.
 */
export async function getReportFacts(
  marketCode: string,
  resolved: ResolvedPeriod,
): Promise<ReportFacts> {
  const rows = await fetchReportFactRows();
  return buildReportFacts(rows, resolved, marketCode);
}

/**
 * The raw current fact rows, fetched once. Exposed so a caller needing MANY
 * markets (the By-Market table) projects them in memory instead of issuing one
 * identical query per market.
 */
export async function fetchReportFactRows(): Promise<ReportFactRow[]> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("lp_report_facts")
      .select(
        "report_type, period_start, period_end, as_of_date, scope, market, branch_code_raw, metric, bucket, value_cents, value_count",
      )
      .eq("is_current", true)
      .in("report_type", ["sales_efficiency", "source_cost", "lead_disposition", "job_status_ytd"])
      // ⚠️ Undocumented truncation, and it fails SILENTLY — past this ceiling
      // rows vanish with no error and tiles quietly under-report. Headroom as
      // of 2026-08-11: 1,844 current rows of 5,000, and adding
      // `cohort_lost_by_status` cost 164 of them. Every new metric or market
      // spends more, so raise this deliberately rather than discovering it.
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReportFactRow[];
  } catch (err) {
    console.error("[reportFacts] fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * Partial-coverage flags for the current report snapshots.
 *
 * `scorecard_report_snapshots.is_partial_month` has been computed and stored on
 * every snapshot since 2026-08-06 — `lp_is_partial_coverage()` is the file's ET
 * generation date compared against its own `period_end` — and nothing has ever
 * read it. A file generated before the period it declares has ended does not
 * cover all of it, and publishing that as a whole period understates the totals
 * in a way that looks like a bad day of selling rather than a short file.
 *
 * NULL means unknown, not false: legacy PDF snapshots carry no reliable
 * generation time. Callers must treat only an explicit `true` as partial.
 *
 * A fetch failure yields an empty map, so the chip falls back to its existing
 * wording rather than the page failing.
 */
export type PartialCoverage = { periodEnd: string; isPartial: boolean | null };

export async function getPartialCoverage(): Promise<Map<string, PartialCoverage>> {
  const out = new Map<string, PartialCoverage>();
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("scorecard_report_snapshots")
      .select("report_type, scope, period_start, period_end, is_partial_month")
      .eq("is_current", true)
      .in("scope", ["mtd", "month"]);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as {
      report_type: string; scope: string; period_start: string;
      period_end: string; is_partial_month: boolean | null;
    }[]) {
      // Keyed by report_type + period_start so a month's snapshot is never read
      // as another month's, which is the mistake that put a prior month's row
      // under this month's label once already.
      const key = `${r.report_type}|${r.period_start}`;
      const prev = out.get(key);
      if (!prev || r.period_end > prev.periodEnd) {
        out.set(key, { periodEnd: r.period_end, isPartial: r.is_partial_month });
      }
    }
  } catch (err) {
    console.error("[reportFacts] partial coverage fetch failed:", (err as Error)?.message ?? err);
  }
  return out;
}
