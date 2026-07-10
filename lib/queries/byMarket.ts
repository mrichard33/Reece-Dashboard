import { getScorecardForPeriod } from "@/lib/queries/scorecard";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * By-Market rollup for the scorecard ⑤ table. Fetches the company REECE total plus
 * each market in parallel (same period/source as the main view) and keeps only the
 * markets that have a stored row. Utility rows (Unassigned / Out of Area) surface
 * only when they carry activity.
 */

const MARKETS: { code: string; label: string; utility?: boolean }[] = [
  { code: "STPET_MKT", label: "St. Petersburg" },
  { code: "ORL_MKT", label: "Orlando" },
  { code: "FTMYR_MKT", label: "Fort Myers" },
  { code: "JAX_MKT", label: "Jacksonville" },
  { code: "SAR_MKT", label: "Sarasota" },
  { code: "FTLAU_MKT", label: "Fort Lauderdale" },
  { code: "LAKE_MKT", label: "Lakeland" },
  { code: "UNASSIGNED", label: "Unassigned", utility: true },
  { code: "OUT_OF_AREA", label: "Out of Area", utility: true },
];

export type ByMarketRow = {
  market: string;
  label: string;
  utility: boolean;
  leads: number;
  issued: number;
  demos: number;
  sales: number;
  close_pct: number | null;
  gross_sales: number;
  net_sales: number;
  /** Prorated (to-date) goal for the period, if the market has a goal. */
  goal: number | null;
  /** Net as a % of the prorated goal, 0+ (null when no goal). */
  pctToGoal: number | null;
};

export type ByMarketView = { rows: ByMarketRow[]; total: ByMarketRow | null };

/** Per-market fetch that never rejects — a bad market must not take down the page. */
async function safeView(market: string, resolved: ResolvedPeriod) {
  try {
    return await getScorecardForPeriod(market, resolved);
  } catch (err) {
    console.error(`[byMarket] ${market} failed:`, (err as Error)?.message ?? err);
    return null;
  }
}

export async function getByMarket(resolved: ResolvedPeriod): Promise<ByMarketView> {
  const [reece, ...marketViews] = await Promise.all([
    safeView("REECE", resolved),
    ...MARKETS.map((m) => safeView(m.code, resolved)),
  ]);

  type V = NonNullable<Awaited<ReturnType<typeof getScorecardForPeriod>>>;
  const toRow = (market: string, label: string, utility: boolean, v: V): ByMarketRow => {
    const a = v.actuals;
    const goal = utility ? null : v.derived.mtd_goal_dollars || null;
    const net = a.net_sales ?? 0;
    return {
      market,
      label,
      utility,
      leads: a.leads ?? 0,
      issued: a.issued ?? 0,
      demos: a.demos ?? 0,
      sales: a.sales ?? 0,
      close_pct: a.close_pct,
      gross_sales: a.gross_sales ?? 0,
      net_sales: net,
      goal,
      pctToGoal: goal && goal > 0 ? Math.round((net / goal) * 1000) / 10 : null,
    };
  };

  const rows: ByMarketRow[] = [];
  marketViews.forEach((v, i) => {
    const m = MARKETS[i];
    if (!v || !m) return;
    const row = toRow(m.code, m.label, !!m.utility, v);
    // Utility rows only when they carry activity.
    if (m.utility && row.leads + row.issued + row.demos + row.sales + row.gross_sales === 0) return;
    rows.push(row);
  });

  // Real markets first (by net desc), then utility rows.
  rows.sort((x, y) => Number(x.utility) - Number(y.utility) || y.net_sales - x.net_sales);

  const total = reece ? toRow("REECE", "All Markets", false, reece) : null;
  return { rows, total };
}
