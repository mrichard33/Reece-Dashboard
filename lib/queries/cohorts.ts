import { lpServer } from "@/lib/supabase/lp";
import {
  historicalMatureNsaRate,
  type CohortObservation,
  type HistoricalMatureNsaRate,
} from "./cohorts.core";
import type { Measured } from "@/lib/scorecard/tiers/types";

/**
 * DB wrapper for the cohort layer. The pure core is `cohorts.core.ts`; this
 * file only fetches and re-exports, so callers have one import.
 *
 * Source is the `lp_cohort_maturation` view (LP-MCP migrations
 * 2026-08-12_cohort_maturation.sql, replaced by
 * 2026-08-12b_cohort_disposition_split.sql — which separates the DEFINITION of
 * Net Sales from LP's reported disposition and adds
 * observed_disposition_cents / reconciliation_delta_cents), already at MARKET
 * grain with
 * office codes summed — §7's rule enforced in the database rather than
 * re-implemented per reader. `rollupToMarket` in the core stays exported for
 * callers holding office-grain rows and for the regression test that proves
 * the rollup is what produces Fort Lauderdale's real figures.
 *
 * A fetch failure returns [] with a console.error, never throws — the panels
 * render "not yet sourced", never $0. Matching `reportFacts.ts`.
 */

export * from "./cohorts.core";

/** Columns of `lp_cohort_maturation` this repo reads. */
const COHORT_COLUMNS =
  "contract_month, market, observed_on, cohort_age_days, snapshot_id, scope, is_current, " +
  "office_count, gross_cents, nsa_cents, working_cents, hold_cents, cancelled_cents, cd_cents, " +
  "net_sales_cents, issued_count, sat_count, sold_count";

type CohortRow = {
  contract_month: string;
  market: string;
  observed_on: string;
  cohort_age_days: number | null;
  snapshot_id: string;
  scope: string | null;
  is_current: boolean | null;
  office_count: number | null;
  gross_cents: number | null;
  nsa_cents: number | null;
  working_cents: number | null;
  hold_cents: number | null;
  cancelled_cents: number | null;
  cd_cents: number | null;
  net_sales_cents: number | null;
  issued_count: number | null;
  sat_count: number | null;
  sold_count: number | null;
};

function toObservation(r: CohortRow): CohortObservation {
  return {
    contractMonth: r.contract_month,
    market: r.market,
    observedOn: r.observed_on,
    officeCount: r.office_count ?? 0,
    grossCents: r.gross_cents,
    nsaCents: r.nsa_cents,
    workingCents: r.working_cents,
    holdCents: r.hold_cents,
    cancelledCents: r.cancelled_cents,
    cdCents: r.cd_cents,
    issuedCount: r.issued_count,
    satCount: r.sat_count,
    soldCount: r.sold_count,
    isCurrent: r.is_current ?? false,
  };
}

/**
 * The CURRENT observation of every cohort — one row per (contract_month,
 * market). This is what Panel 3 renders and what the mature rate is derived
 * from.
 *
 * ⚠️ Current observations only. The view deliberately retains every superseded
 * snapshot, so an unfiltered read returns a cohort once per time it was
 * observed and would count it that many times in any sum.
 */
export async function fetchCurrentCohorts(): Promise<CohortObservation[]> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("lp_cohort_maturation")
      .select(COHORT_COLUMNS)
      .eq("is_current", true)
      .order("contract_month", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as CohortRow[]).map(toObservation);
  } catch (err) {
    console.error("[cohorts] current fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * The full observation history for one cohort, oldest first — the maturation
 * series for §4. Nothing consumes this yet: usable NSA readings only begin
 * 2026-08-09, so the curve has too few points to draw. It ships now so the
 * series accumulates and the panel has data when it lands.
 */
export async function fetchCohortHistory(contractMonth?: string): Promise<CohortObservation[]> {
  try {
    const sb = await lpServer();
    let q = sb.from("lp_cohort_maturation").select(COHORT_COLUMNS);
    if (contractMonth) q = q.eq("contract_month", contractMonth);
    const { data, error } = await q
      .order("contract_month", { ascending: true })
      .order("observed_on", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as CohortRow[]).map(toObservation);
  } catch (err) {
    console.error("[cohorts] history fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * Company-level HISTORICAL MATURE NSA RATE: Σ NSA ÷ Σ Gross Written over
 * eligible cohorts, summed then divided.
 *
 * ⚠️ The numerator is SETTLED NSA, not Net Sales. Σ Net Sales ÷ Σ Gross Written
 * is a different figure — Net Retention % — and describing this one that way is
 * exactly the confusion the rename exists to prevent. Both round to 71.1% on
 * Jan–May 2026, so the error would not be caught by eye; on July they are 50.9%
 * and 76.3%.
 *
 * `asOf` is the observation date the eligibility window is measured to — pass
 * the period's as-of, not `new Date()`, so the figure is reproducible.
 */
export async function getCompanyHistoricalMatureNsaRate(asOf: string): Promise<Measured<HistoricalMatureNsaRate>> {
  const cohorts = await fetchCurrentCohorts();
  return historicalMatureNsaRate(cohorts, asOf);
}

/**
 * Per-market mature rate, falling back to the company rate where a market has
 * too little volume to carry its own. The `ownRate` flag tells the UI which
 * cells to mark — a borrowed rate must never render as if it were measured.
 */
export async function getMarketHistoricalMatureNsaRates(
  asOf: string,
): Promise<{ company: Measured<HistoricalMatureNsaRate>; byMarket: Map<string, { rate: Measured<HistoricalMatureNsaRate>; ownRate: boolean }> }> {
  const cohorts = await fetchCurrentCohorts();
  const company = historicalMatureNsaRate(cohorts, asOf);

  const markets = [...new Set(cohorts.map((c) => c.market))];
  const byMarket = new Map<string, { rate: Measured<HistoricalMatureNsaRate>; ownRate: boolean }>();

  for (const market of markets) {
    // §7 applies to the MODEL too: derive the market's rate from its own summed
    // numerator and denominator. Never average its offices' rates, and never
    // compute per office and sum — that recreates the office/market split on
    // samples far too small to be stable.
    const own = historicalMatureNsaRate(
      cohorts.filter((c) => c.market === market),
      asOf,
    );
    const enough =
      own.known && own.value.grossCents >= MIN_GROSS_FOR_OWN_RATE_CENTS_LOCAL;
    byMarket.set(market, { rate: enough ? own : company, ownRate: enough });
  }

  return { company, byMarket };
}

// Re-exported constant, referenced locally so the fallback threshold and the
// core's definition cannot drift apart.
import { MIN_GROSS_FOR_OWN_RATE_CENTS as MIN_GROSS_FOR_OWN_RATE_CENTS_LOCAL } from "./cohorts.core";
