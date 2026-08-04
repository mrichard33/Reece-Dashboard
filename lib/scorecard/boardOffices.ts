import { normalizeMarketCode, marketLabel } from "./markets";

/**
 * Capacity-board office rows collapsed onto DISPLAY markets. Lakeland is not a
 * market: LAKE_MKT's slots/appointments sum into the Orlando row and the word
 * never renders. Unknown market codes pass through untouched so they surface
 * visibly instead of silently merging into another market. Pure — unit-tested.
 */

export type BoardOfficeLike = {
  market: string;
  office_label: string;
  requested: number;
  booked: number;
  confirmed: number;
  set_pending: number;
  fill_pct: number | null;
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
        // Canonical label ("Orlando", never "Lakeland"); unknown codes keep the
        // upstream label so they stay identifiable.
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
