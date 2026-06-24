import { lpServer } from "@/lib/supabase/lp";
import {
  getSourceScorecard,
  getSourceScorecardForPeriod,
  type SourceScorecardView,
} from "@/lib/queries/sources";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * Lead Cost / cost-as-%-of-revenue / ROMI (Phase 3B).
 *
 * LP has no spend data, so spend is joined from two places over the snapshot's
 * MTD window:
 *   1. lp_source_spend_daily — generic per-source spend (LeadGurus ingest, Google/
 *      Meta exports, manual CSV). Empty until a feed is connected.
 *   2. ft_daily_summary — the EXISTING LeadGurus feed, summed over the window and
 *      attributed to the "Lead Gurus" source (reuses what's already populated).
 *
 * Sources with no spend render "not connected" rather than a misleading 0%. We do
 * NOT invent spend. Cost%/ROMI use Net Sales (released $).
 */

/** Source whose spend comes from the existing LeadGurus ft_* feed. */
const LEAD_GURUS_SOURCE = "lead gurus";

const DEFAULT_TARGET_PCT = 15;

export type LeadCostRow = {
  source: string;
  leads: number;
  issued: number;
  demos: number;
  sales: number;
  set_pct: number | null;
  demo_pct: number | null;
  close_pct: number | null;
  net_sales: number;
  pending: number;
  spend: number | null;
  raw_leads: number | null;
  cost_per_lead: number | null;
  cost_pct: number | null;
  romi: number | null;
  source_system: string | null;
  connected: boolean;
};

export type LeadCostView = {
  as_of_date: string;
  period_start: string | null;
  period_end: string | null;
  target_pct: number;
  rows: LeadCostRow[];
  any_connected: boolean;
};

type Agg = {
  source: string;
  leads: number;
  sets: number;
  issued: number;
  net_issue: number;
  demos: number;
  sales: number;
  net_sales: number;
  pending: number;
};

function ratio(numr: number, den: number): number | null {
  if (!den) return null;
  return Math.round((numr / den) * 1000) / 10;
}

export async function getLeadCost(
  market = "REECE",
  asOf?: string,
): Promise<LeadCostView | null> {
  const sv = await getSourceScorecard(market, asOf);
  if (!sv) return null;
  return computeLeadCost(market, sv);
}

/**
 * Period-aware lead cost. Sources the per-source view for the resolved period and
 * windows spend over [periodStart, periodEnd] (overriding the snapshot's MTD
 * window) so cost % / ROMI match the selected range.
 */
export async function getLeadCostForPeriod(
  market: string,
  resolved: ResolvedPeriod,
): Promise<LeadCostView | null> {
  const sv = await getSourceScorecardForPeriod(market, resolved);
  if (!sv) return null;
  return computeLeadCost(market, {
    ...sv,
    period_start: resolved.periodStart,
    period_end: resolved.periodEnd,
  });
}

async function computeLeadCost(
  market: string,
  sv: SourceScorecardView,
): Promise<LeadCostView | null> {
  const { as_of_date, period_start, period_end } = sv;

  // Collapse per-(source, sub_source) rows to the source level.
  const bySource = new Map<string, Agg>();
  for (const r of sv.rows) {
    const key = r.source || "(none)";
    const a =
      bySource.get(key) ??
      { source: key, leads: 0, sets: 0, issued: 0, net_issue: 0, demos: 0, sales: 0, net_sales: 0, pending: 0 };
    a.leads += r.leads;
    a.sets += r.sets;
    a.issued += r.issued;
    a.net_issue += r.net_issue;
    a.demos += r.demos;
    a.sales += r.sales;
    a.net_sales += r.net_sales ?? 0;
    a.pending += r.pending_total ?? 0;
    bySource.set(key, a);
  }

  // Spend by source from the generic feed, summed over the MTD window.
  const spendBySource = new Map<string, { spend: number; raw_leads: number; system: string | null }>();
  if (period_start && period_end) {
    const sb = await lpServer();
    const { data: spendRows } = await sb
      .from("lp_source_spend_daily")
      .select("source, spend, raw_leads, source_system")
      .eq("market", market)
      .gte("spend_date", period_start)
      .lte("spend_date", period_end);
    for (const s of (spendRows ?? []) as Record<string, unknown>[]) {
      const key = s.source ? String(s.source) : "(none)";
      const e = spendBySource.get(key) ?? { spend: 0, raw_leads: 0, system: null };
      e.spend += Number(s.spend) || 0;
      e.raw_leads += Number(s.raw_leads) || 0;
      e.system = e.system ?? (s.source_system ? String(s.source_system) : null);
      spendBySource.set(key, e);
    }

    // Reuse the existing LeadGurus feed for the "Lead Gurus" source.
    const { data: ftRows } = await sb
      .from("ft_daily_summary")
      .select("total_spend, total_leads")
      .gte("date", period_start)
      .lte("date", period_end);
    let lgSpend = 0;
    let lgLeads = 0;
    for (const f of (ftRows ?? []) as Record<string, unknown>[]) {
      lgSpend += Number(f.total_spend) || 0;
      lgLeads += Number(f.total_leads) || 0;
    }
    if (lgSpend > 0 || lgLeads > 0) {
      const lgKey = [...bySource.keys()].find((k) => k.toLowerCase() === LEAD_GURUS_SOURCE) ?? "Lead Gurus";
      const e = spendBySource.get(lgKey) ?? { spend: 0, raw_leads: 0, system: null };
      e.spend += lgSpend;
      e.raw_leads += lgLeads;
      e.system = e.system ?? "leadgurus";
      spendBySource.set(lgKey, e);
    }
  }

  const target_pct = Number(process.env.SCORECARD_LEADCOST_TARGET_PCT) || DEFAULT_TARGET_PCT;

  const rows: LeadCostRow[] = [...bySource.values()].map((a) => {
    const sp = spendBySource.get(a.source);
    const spend = sp ? sp.spend : null;
    const raw_leads = sp && sp.raw_leads > 0 ? sp.raw_leads : null;
    const connected = spend != null && spend > 0;
    const cplDen = raw_leads ?? a.leads;
    return {
      source: a.source,
      leads: a.leads,
      issued: a.issued,
      demos: a.demos,
      sales: a.sales,
      set_pct: ratio(a.sets, a.leads),
      demo_pct: ratio(a.demos, a.net_issue),
      close_pct: ratio(a.sales, a.demos),
      net_sales: a.net_sales,
      pending: a.pending,
      spend,
      raw_leads,
      cost_per_lead: connected && cplDen > 0 ? Math.round(spend! / cplDen) : null,
      cost_pct: connected && a.net_sales > 0 ? Math.round((spend! / a.net_sales) * 1000) / 10 : null,
      romi: connected ? Math.round((a.net_sales / spend!) * 100) / 100 : null,
      source_system: sp?.system ?? null,
      connected,
    };
  });

  return {
    as_of_date,
    period_start,
    period_end,
    target_pct,
    rows,
    any_connected: rows.some((r) => r.connected),
  };
}
