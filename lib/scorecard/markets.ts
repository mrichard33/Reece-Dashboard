/**
 * Scorecard market codes + label helper — a plain module (NOT "use client") so both
 * the server scorecard page and the client MarketPicker/GoalEditor can import it.
 *
 * THE single source of truth for the dashboard's market list. Every other list
 * (By-Market rows, editor markets, company rollup, capacity-board order) derives
 * from SCORECARD_MARKETS — do not hardcode market codes elsewhere.
 *
 * Each display market maps to one or more warehouse source codes (the per-market
 * snapshot rows written by the LP-MCP per-market writer). Most markets are 1:1
 * with their warehouse code; Fort Lauderdale and Orlando span several (see the
 * rules below).
 *
 * Branch→market resolution itself lives upstream in LP Supabase
 * (lp_branch_market_map) + LP-MCP's market-resolver; the dashboard only ever sees
 * *_MKT codes.
 *
 * LAKELAND IS ORLANDO (ruling, 2026-09-28 — REVERSES the 2026-08-06 split):
 * Lakeland and Orlando are ONE market, Orlando. The merge is done in the
 * warehouse, not here: LP-MCP sql/135_lake_orl_merge.sql maps LAKE → ORL_MKT in
 * lp_branch_market_map, relabels every historical LAKE_MKT row and sums the
 * aggregates into Orlando's rows, so no LAKE_MKT row should exist any more.
 * LAKE_MKT is deliberately NOT one of Orlando's `sources`: sources feed the
 * goal editor and the company goal rollup (OFFICE_SOURCE_CODES), which would
 * then show — and could save — a hidden Lakeland goal row. Instead it is a
 * LEGACY_CODE_ALIASES entry, which only normalizeMarketCode reads: a straggling
 * row (a writer on a stale market-map cache, a re-ingested old snapshot) folds
 * onto Orlando rather than surfacing as a stray seventh market. There is no
 * Lakeland tile, row, goal or picker entry anywhere.
 *
 * RECONCILIATION GROUPING RULE (ruling, 2026-08-04): BOCA, MIAMI, and RFED
 * branches all roll into FTLAU_MKT upstream — intended behavior, not a defect.
 * LP reports (e.g. Jobs by Milestone Date) still print those branch codes
 * separately; when comparing report totals to dashboard totals, compare
 * BOCA + FTLAU + MIAMI + RFED from the report against the single Fort
 * Lauderdale market here. LAKE is now the same case for Orlando: compare
 * ORL + LAKE from the report against the single Orlando market here.
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
  { code: "ORL_MKT", label: "Orlando", sources: ["ORL_MKT"] },
  { code: "FTMYR_MKT", label: "Fort Myers", sources: ["FTMYR_MKT"] },
  { code: "JAX_MKT", label: "Jacksonville", sources: ["JAX_MKT"] },
  { code: "SAR_MKT", label: "Sarasota", sources: ["SAR_MKT"] },
  { code: "FTLAU_MKT", label: "Fort Lauderdale", sources: ["FTLAU_MKT"] },
] as const;

/**
 * Retired warehouse codes → the display market that absorbed them. Read ONLY by
 * normalizeMarketCode (display folding) — never by the goal editor, the goal
 * rollup or source-filtered queries. See the LAKELAND note above.
 */
export const LEGACY_CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  LAKE_MKT: "ORL_MKT", // Lakeland merged into Orlando, 2026-09-28
});

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
 * (Six since 2026-09-28 — Lakeland merged into Orlando; see above.)
 */
export const UTILITY_MARKETS: readonly ScorecardMarket[] = [
  { code: "UNASSIGNED", label: "Unassigned", sources: ["UNASSIGNED", "OUT_OF_AREA"] },
];

/** Every warehouse code that rolls into the single UNASSIGNED display row. */
export const UNASSIGNED_SOURCE_CODES: readonly string[] = UTILITY_MARKETS[0]!.sources;

/**
 * The complete display-market list a tier renders: 6 markets + UNASSIGNED.
 * Nothing else is a market. Lakeland is part of Orlando (ruling 2026-09-28).
 */
export const DISPLAY_MARKETS: readonly { code: string; label: string; sources: readonly string[]; utility: boolean }[] = [
  ...SCORECARD_MARKETS.map((m) => ({ code: m.code, label: m.label, sources: m.sources, utility: false })),
  ...UTILITY_MARKETS.map((m) => ({ code: m.code, label: m.label, sources: m.sources, utility: true })),
];

/**
 * Collapse ANY warehouse market code onto its display entity — the one function
 * every tier read passes raw fact rows through. OUT_OF_AREA → UNASSIGNED,
 * everything else to itself. Unknown codes pass through untouched so a new
 * warehouse code surfaces visibly rather than silently vanishing into another
 * market's total.
 */
export function displayMarketOf(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "UNASSIGNED";
  if (UNASSIGNED_SOURCE_CODES.includes(c)) return "UNASSIGNED";
  return normalizeMarketCode(c);
}

/**
 * Normalize an incoming market code: source codes collapse onto their display
 * market (BOCA/MIAMI/RFED-backed rows already arrive as FTLAU_MKT; a stray
 * LAKE_MKT row collapses onto ORL_MKT). Unknown
 * codes pass through untouched so they surface visibly instead of silently
 * merging into another market.
 */
export function normalizeMarketCode(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return "";
  if (LEGACY_CODE_ALIASES[c]) return LEGACY_CODE_ALIASES[c];
  for (const m of SCORECARD_MARKETS) {
    if (m.code === c || m.sources.includes(c)) return m.code;
  }
  return c;
}

/**
 * The warehouse source codes behind a display market (REECE → its own row).
 *
 * Utility rows are resolved too. `displayMarketOf` has always folded
 * OUT_OF_AREA onto UNASSIGNED, but this function only consulted
 * SCORECARD_MARKETS, so a read filtered to UNASSIGNED silently dropped every
 * OUT_OF_AREA row — 1,084 YTD leads' worth. Two functions disagreeing about
 * one cardinality ruling (2026-08-05 §7) is the same defect class the ruling
 * exists to prevent.
 */
export function marketSources(code: string): readonly string[] {
  if (!code || code === "REECE") return ["REECE"];
  const norm = normalizeMarketCode(code);
  const m = SCORECARD_MARKETS.find((x) => x.code === norm);
  if (m) return m.sources;
  const u = UTILITY_MARKETS.find((x) => x.code === norm || x.sources.includes(norm));
  return u ? u.sources : [code];
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
