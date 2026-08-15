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
 *
 * ══ WHY THIS PAGES (2026-08-15) ══
 *
 * It used to be a single `.limit(5000)`, with a comment reasoning about headroom
 * — "1,844 current rows of 5,000". That headroom never existed. PostgREST
 * enforces its own `db-max-rows` ceiling and a client `.limit()` cannot raise
 * it: past the server's cap the response is simply short, with **no error and
 * no truncation flag**. The comment measured the TABLE and assumed the request
 * returned it.
 *
 * The query also had no `order`, so WHICH rows came back was whatever order the
 * scan produced — in practice roughly heap order, so the NEWEST facts were the
 * ones dropped.
 *
 * What that looked like on 2026-08-15, at 2,188 current rows: the January–July
 * month facts were present, so the Leads rate computed and rendered a target of
 * 5,934. The AUGUST rows — re-inserted by that morning's ingest and therefore
 * last in the heap — were not, so the same page showed:
 *
 *   • "Report 137 has not landed for this period" on the Sold card, while
 *     report 137 held 54 sales / $1,283,027 for Fort Myers;
 *   • a Leads ACTUAL of "—" beside a Leads TARGET of 5,934, from one table;
 *   • the same for every office.
 *
 * Every one of those figures existed in the warehouse. Nothing failed, nothing
 * logged, and the page confidently reported them as unsourced.
 *
 * So: page until a short page proves the set is exhausted, on a total order, and
 * make stopping early LOUD. Any fetch of this table that assumes a single
 * request returns all of it is wrong, however large the limit looks.
 */
export async function fetchReportFactRows(): Promise<ReportFactRow[]> {
  const PAGE = 1000;
  /** Runaway guard, not a capacity limit. 2,188 current rows on 2026-08-15. */
  const MAX_PAGES = 50;
  const out: ReportFactRow[] = [];
  try {
    const sb = await lpServer();
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE;
      const { data, error } = await sb
        .from("lp_report_facts")
        .select(
          "report_type, period_start, period_end, as_of_date, scope, market, branch_code_raw, metric, bucket, value_cents, value_count",
        )
        .eq("is_current", true)
        .in("report_type", ["sales_efficiency", "source_cost", "lead_disposition", "job_status_ytd"])
        // A TOTAL order on a unique column. Without it PostgREST pages over an
        // unordered scan and a row can appear twice, or never — which is a
        // quieter version of the same defect this function just had.
        .order("fact_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ReportFactRow[];
      out.push(...rows);
      // A short page means the set is exhausted. This is the ONLY exit that
      // means "we have everything".
      if (rows.length < PAGE) return out;
    }
    // Falling out of the loop means we stopped early and are under-reporting.
    // Loud, because the old failure mode was exactly this and it was silent.
    console.error(
      `[reportFacts] page cap hit — read ${out.length} rows and stopped. Figures on ` +
        `this render are UNDER-REPORTED. Raise MAX_PAGES.`,
    );
    return out;
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
