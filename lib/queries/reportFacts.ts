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
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReportFactRow[];
  } catch (err) {
    console.error("[reportFacts] fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}
