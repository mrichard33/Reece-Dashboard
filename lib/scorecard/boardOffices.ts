import { normalizeMarketCode, marketLabel } from "./markets";

/**
 * Capacity-board office rows collapsed onto DISPLAY markets.
 *
 * LP-MCP already emits one row per warehouse market_code (lp_branch_market_map),
 * so in practice this is a defensive normalize-and-label pass: it guards against
 * an upstream row arriving under a SOURCE code rather than a display code.
 * Lakeland is its own market (ruling 2026-08-06) — LAKE_MKT normalizes to itself
 * and keeps its own tile and its own "Lakeland" label. Unknown market codes pass
 * through untouched so they surface visibly instead of silently merging into
 * another market. Pure — unit-tested.
 */

export type BoardOfficeLike = {
  market: string;
  office_label: string;
  requested: number;
  booked: number;
  confirmed: number;
  set_pending: number;
  fill_pct: number | null;
  /** Live Five9 dial priority, 1 = dialed first. null when Five9 is unreadable. */
  dial_rank?: number | null;
};

export function mergeBoardOffices(offices: BoardOfficeLike[]): BoardOfficeLike[] {
  const byDisplay = new Map<string, BoardOfficeLike>();
  for (const o of offices) {
    const code = normalizeMarketCode(o.market);
    const acc = byDisplay.get(code);
    if (!acc) {
      byDisplay.set(code, {
        ...o,
        market: code,
        // Canonical label for a known market; unknown codes keep the upstream
        // label so they stay identifiable.
        office_label: marketLabel(code) === code ? o.office_label : marketLabel(code),
      });
    } else {
      acc.requested += o.requested;
      acc.booked += o.booked;
      acc.confirmed += o.confirmed;
      acc.set_pending += o.set_pending;
    }
  }
  // Re-derive fill % from the summed counts (never average percentages).
  return [...byDisplay.values()].map((o) => ({
    ...o,
    fill_pct: o.requested > 0 ? Math.round((100 * o.confirmed) / o.requested) : null,
  }));
}
