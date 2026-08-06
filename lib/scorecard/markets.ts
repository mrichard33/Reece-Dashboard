/**
 * Scorecard market codes + label helper — a plain module (NOT "use client") so both
 * the server scorecard page and the client MarketPicker/GoalEditor can import it.
 *
 * THE single source of truth for the dashboard's market list. Every other list
 * (By-Market rows, editor markets, company rollup, capacity-board order) derives
 * from SCORECARD_MARKETS — do not hardcode market codes elsewhere.
 *
 * Each display market maps to one or more warehouse source codes (the per-market
 * snapshot rows written by the LP-MCP per-market writer). Orlando is the combined
 * ORL_MKT + LAKE_MKT market: Lakeland's rows still exist in the warehouse, but the
 * dashboard reads, sums, and renders them as one Orlando market everywhere —
 * actuals, goals, filters, and pace.
 *
 * Branch→market resolution itself lives upstream in LP Supabase
 * (lp_branch_market_map) + LP-MCP's market-resolver; the dashboard only ever sees
 * *_MKT codes.
 *
 * RECONCILIATION GROUPING RULE (ruling, 2026-08-04): BOCA, MIAMI, and RFED
 * branches all roll into FTLAU_MKT upstream — intended behavior, not a defect.
 * LP reports (e.g. Jobs by Milestone Date) still print those branch codes
 * separately; when comparing report totals to dashboard totals, compare
 * BOCA + FTLAU + MIAMI + RFED from the report against the single Fort
 * Lauderdale market here. Likewise the LAKE branch: every LAKE number rolls
 * into Orlando and Lakeland is never a display entity anywhere on the
 * dashboard.
 */

export type ScorecardMarket = {
  /** Display/query code — what `?market=` carries and what rows key on. */
  code: string;
  label: string;
  /** Warehouse market codes whose rows sum into this display market. */
  sources: readonly string[];
};

export const SCORECARD_MARKETS: readonly ScorecardMarket[] = [
  { code: "STPET_MKT", label: "St. Petersburg", sources: ["STPET_MKT"] },
  { code: "ORL_MKT", label: "Orlando", sources: ["ORL_MKT", "LAKE_MKT"] },
  { code: "FTMYR_MKT", label: "Fort Myers", sources: ["FTMYR_MKT"] },
  { code: "JAX_MKT", label: "Jacksonville", sources: ["JAX_MKT"] },
  { code: "SAR_MKT", label: "Sarasota", sources: ["SAR_MKT"] },
  { code: "FTLAU_MKT", label: "Fort Lauderdale", sources: ["FTLAU_MKT"] },
] as const;

/** Every warehouse office code that rolls into the company (REECE) total. */
export const OFFICE_SOURCE_CODES: readonly string[] = SCORECARD_MARKETS.flatMap(
  (m) => m.sources,
);

/**
 * Utility warehouse rows that are never a market but must surface visibly.
 *
 * CARDINALITY RULING (2026-08-05 §7): the warehouse carries TWO codes for the
 * same idea — `UNASSIGNED` (Sales Efficiency / Job Status) and `OUT_OF_AREA`
 * (Lead Disposition). Two labels for one concept means a reader comparing two
 * tiers sees two different market lists and concludes the page disagrees with
 * itself. They reconcile into ONE display entity here: `SELECT DISTINCT market`
 * over any rolled-up tier read returns exactly the 6 markets + UNASSIGNED.
 */
export const UTILITY_MARKETS: readonly ScorecardMarket[] = [
  { code: "UNASSIGNED", label: "Unassigned", sources: ["UNASSIGNED", "OUT_OF_AREA"] },
];

/** Every warehouse code that rolls into the single UNASSIGNED display row. */
export const UNASSIGNED_SOURCE_CODES: readonly string[] = UTILITY_MARKETS[0]!.sources;

/**
 * The complete display-market list a tier renders: 6 markets + UNASSIGNED.
 * Nothing else is a market. Lakeland is never an entry — LAKE_MKT rolls into
 * Orlando via `sources` and has no display identity anywhere.
 */
export const DISPLAY_MARKETS: readonly { code: string; label: string; sources: readonly string[]; utility: boolean }[] = [
  ...SCORECARD_MARKETS.map((m) => ({ code: m.code, label: m.label, sources: m.sources, utility: false })),
  ...UTILITY_MARKETS.map((m) => ({ code: m.code, label: m.label, sources: m.sources, utility: true })),
];

/**
 * Collapse ANY warehouse market code onto its display entity — the one function
 * every tier read passes raw fact rows through. LAKE_MKT → ORL_MKT,
 * OUT_OF_AREA → UNASSIGNED, everything else to itself. Unknown codes pass
 * through untouched so a new warehouse code surfaces visibly rather than
 * silently vanishing into another market's total.
 */
export function displayMarketOf(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "UNASSIGNED";
  if (UNASSIGNED_SOURCE_CODES.includes(c)) return "UNASSIGNED";
  return normalizeMarketCode(c);
}

/**
 * Normalize an incoming market code: legacy/source codes collapse onto their
 * display market (LAKE_MKT → ORL_MKT). Unknown codes pass through untouched so
 * they surface visibly instead of silently merging into another market.
 */
export function normalizeMarketCode(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "";
  for (const m of SCORECARD_MARKETS) {
    if (m.code === c || m.sources.includes(c)) return m.code;
  }
  return c;
}

/** The warehouse source codes behind a display market (REECE → its own row). */
export function marketSources(code: string): readonly string[] {
  if (!code || code === "REECE") return ["REECE"];
  const m = SCORECARD_MARKETS.find((x) => x.code === normalizeMarketCode(code));
  return m ? m.sources : [code];
}

export function marketLabel(code: string | null | undefined): string {
  if (!code || code === "REECE") return "All Markets";
  const norm = normalizeMarketCode(code);
  return (
    SCORECARD_MARKETS.find((m) => m.code === norm)?.label ??
    // Utility codes match on SOURCES, not just code, so OUT_OF_AREA labels as
    // "Unassigned" rather than leaking a raw warehouse code onto the page.
    UTILITY_MARKETS.find((m) => m.code === norm || m.sources.includes(norm))?.label ??
    code
  );
}
