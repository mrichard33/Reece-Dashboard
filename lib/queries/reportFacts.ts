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
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("lp_report_facts")
      .select(
        "report_type, period_start, period_end, as_of_date, market, branch_code_raw, metric, bucket, value_cents, value_count",
      )
      .eq("is_current", true)
      .in("report_type", ["sales_efficiency", "source_cost", "lead_disposition", "job_status_ytd"])
      .limit(1000);
    if (error) throw new Error(error.message);
    return buildReportFacts((data ?? []) as ReportFactRow[], resolved, marketCode);
  } catch (err) {
    console.error("[reportFacts] fetch failed:", (err as Error)?.message ?? err);
    return { sold: null, goodBusiness: null };
  }
}
