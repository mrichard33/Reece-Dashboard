import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { getMarketingCost, type MarketingCostResult } from "@/lib/queries/marketingCost";

/**
 * Lead Cost — now a thin wrapper over the marketing cost ledger
 * (lib/queries/marketingCost.ts, LP-MCP sql/158, 2026-10-12).
 *
 * The previous version joined `lp_source_spend_daily` (never populated) and
 * the company-wide `ft_daily_summary` Lead Gurus feed to EVERY market, and
 * divided spend by raw leads. Both are gone: cost comes from
 * v_market_subsource_cost, filtered to the selected market, and the
 * denominator is gross ISSUED leads (handoff D1). Spend is never invented.
 */

const DEFAULT_TARGET_PCT = 15;

export function leadCostTargetPct(): number {
  return Number(process.env.SCORECARD_LEADCOST_TARGET_PCT) || DEFAULT_TARGET_PCT;
}

export async function getLeadCostForPeriod(
  market: string,
  resolved: ResolvedPeriod,
  grain: "month" | "week" = "month",
): Promise<MarketingCostResult & { target_pct: number }> {
  const r = await getMarketingCost({ market, grain, periodStart: resolved.periodStart, periodEnd: resolved.periodEnd });
  return { ...r, target_pct: leadCostTargetPct() };
}
