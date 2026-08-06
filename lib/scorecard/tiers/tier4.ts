/**
 * TIER 4 — Marketing efficiency.  Basis: lead cohort.
 * Source: `source_cost` (spend + leads) + `sales_efficiency` (funnel + net).
 *
 * Acquisition is NOT the problem. $2.13M of spend against $54.1M of net revenue
 * is 3.9% — efficient for home improvement, where 8–12% is typical. This tier
 * exists to establish that, so attention stops being spent re-litigating lead
 * cost and starts being spent on conversion and survival, where the money
 * actually is.
 *
 * DENOMINATOR MAPPING (pinned by the handoff's own targets, verified live):
 *   • cost and leads come from `source_cost` — spend and the lead count it
 *     bought are the same report's control total, and dividing one report's
 *     numerator by another's denominator is how ratios quietly lie.
 *   • issued / sold / net come from `sales_efficiency` (137), the funnel
 *     authority. Using source_cost's own sold (3,344) and net ($56.9M) instead
 *     yields $637/sale, 3.7%, NSLI $4,025 — all three miss. The stated targets
 *     ($618, 3.9%, $3,505) reproduce only under this mapping.
 *
 * NSLI is the allocation tool: the maximum payable per issued lead from a
 * source while staying profitable. At $3,505 company-wide there is substantial
 * headroom, which argues for buying HARDER from sources whose NSLI holds —
 * hence the by-source ranking, sorted by NSLI descending with volume alongside
 * so a high rate on nine leads is never mistaken for a place to move budget.
 */
import { unmeasured, type Measured, type TierMeta } from "./types";
import { marketLabel } from "@/lib/scorecard/markets";
import { perUnit, rate } from "./metrics";
import { dollarsOf, forMarket, pickSnapshot, sumMetric, type RolledFact } from "./factRollup";

export type Tier4Row = {
  market: string;
  label: string;
  isCompany: boolean;
  costPerLead: Measured;
  costPerIssue: Measured;
  costPerSale: Measured;
  /** Marketing spend as a % of NET revenue — never gross. */
  marketingPctOfNet: Measured;
  /** Net sold $ ÷ leads issued. The allocation ceiling. */
  nsli: Measured;
  /** Volumes, rendered visually secondary to the rates. */
  volumes: { spend: number | null; leads: number | null; issued: number | null; sold: number | null };
};

export type SourceNsliRow = {
  source: string;
  subSource: string;
  issued: number;
  netSales: number;
  nsli: Measured;
};

export type Tier4 = {
  meta: TierMeta;
  rows: Tier4Row[];
  company: Tier4Row;
  /** NSLI by source, ranked descending — the allocation tool. */
  bySource: SourceNsliRow[];
  /** Window the by-source NSLI was computed over, stated on the table. */
  sourceWindowLabel: string;
  /** Company NSLI on the planning window (rolling 90d) — see nsliWindowLabel. */
  planningNsli: Measured;
  nsliWindowLabel: string;
};

/**
 * Per-market spend does not exist. The Source & Cost report is ingested as a
 * single company row set (market='REECE', verified 2026-08-05) — there is no
 * market dimension on spend to divide by. Every per-market cost cell therefore
 * says so rather than inventing an allocation.
 */
const NO_MARKET_SPEND =
  "marketing spend is reported company-wide only — no per-market cost dimension exists in Source & Cost";

const round2 = (n: number) => Math.round(n * 100) / 100;

function buildRow(
  market: string,
  isCompany: boolean,
  spend: number | null,
  leads: number | null,
  issued: number | null,
  sold: number | null,
  net: number | null,
): Tier4Row {
  const noSpend = isCompany ? "no Source & Cost snapshot for this window" : NO_MARKET_SPEND;
  const cpl =
    spend == null || leads == null ? unmeasured(noSpend) : perUnit(spend, leads, "cost per lead");
  const cpi =
    spend == null || issued == null ? unmeasured(noSpend) : perUnit(spend, issued, "cost per issue");
  const cps =
    spend == null || sold == null ? unmeasured(noSpend) : perUnit(spend, sold, "cost per sale");
  const pctNet =
    spend == null || net == null
      ? unmeasured(noSpend)
      : rate(spend, net, "marketing % of net revenue");
  const nsli =
    net == null || issued == null
      ? unmeasured("no net or issued volume for this market in the window")
      : perUnit(net, issued, "NSLI");

  return {
    market,
    label: isCompany ? "All Markets" : marketLabel(market),
    isCompany,
    costPerLead: cpl,
    costPerIssue: cpi,
    costPerSale: cps,
    marketingPctOfNet: pctNet,
    nsli,
    volumes: { spend, leads, issued, sold },
  };
}

export function buildTier4(
  rolled: readonly RolledFact[],
  bySource: SourceNsliRow[],
  opts: {
    markets: readonly string[];
    sourceWindowLabel: string;
    planningNsli: Measured;
    nsliWindowLabel: string;
  },
): Tier4 {
  const sc = pickSnapshot(rolled, "source_cost", "ytd");
  const se = pickSnapshot(rolled, "sales_efficiency", "ytd");
  const asOf = sc[0]?.as_of_date ?? se[0]?.as_of_date ?? null;

  const spendSum = sumMetric(sc, "marketing_cost");
  const spend = spendSum.seen ? dollarsOf(spendSum.cents) : null;
  const leadsSum = sumMetric(sc, "leads");
  const leads = leadsSum.seen ? leadsSum.count : null;

  const seFor = (market: string) => {
    const rows = forMarket(se, market);
    const issued = sumMetric(rows, "issued");
    const sold = sumMetric(rows, "sold");
    const net = sumMetric(rows, "net_sold");
    return {
      issued: issued.seen ? issued.count : null,
      sold: sold.seen ? sold.count : null,
      net: net.seen ? dollarsOf(net.cents) : null,
    };
  };

  const companyFunnel = seFor("REECE");
  const company = buildRow(
    "REECE",
    true,
    spend == null ? null : round2(spend),
    leads,
    companyFunnel.issued,
    companyFunnel.sold,
    companyFunnel.net == null ? null : round2(companyFunnel.net),
  );

  const rows = opts.markets.map((code) => {
    const f = seFor(code);
    // Spend is company-only, so every per-market cost cell resolves to "—" with
    // NO_MARKET_SPEND as the reason. NSLI still resolves per market: it needs
    // only net and issued, both of which the funnel report carries by market.
    return buildRow(code, false, null, null, f.issued, f.sold, f.net == null ? null : round2(f.net));
  });

  return {
    meta: {
      tier: 4,
      title: "Marketing efficiency",
      question: "What are we paying per lead, and how hard should we buy?",
      basis: "lead_cohort",
      basisDetail: `year to date${asOf ? ` · as of ${asOf}` : ""}`,
      source: "Source & Cost + Sales Efficiency (137)",
    },
    rows,
    company,
    bySource: [...bySource].sort((a, b) => {
      const av = a.nsli.known ? a.nsli.value : -Infinity;
      const bv = b.nsli.known ? b.nsli.value : -Infinity;
      if (av !== bv) return bv - av;
      return b.issued - a.issued;
    }),
    sourceWindowLabel: opts.sourceWindowLabel,
    planningNsli: opts.planningNsli,
    nsliWindowLabel: opts.nsliWindowLabel,
  };
}
