import { describe, expect, it } from "vitest";
import { mergeBoardOffices, type BoardOfficeLike } from "./boardOffices";

const office = (
  market: string,
  office_label: string,
  requested: number,
  confirmed: number,
  set_pending = 0,
): BoardOfficeLike => ({
  market,
  office_label,
  requested,
  booked: confirmed,
  confirmed,
  set_pending,
  fill_pct: requested > 0 ? Math.round((100 * confirmed) / requested) : null,
});

describe("mergeBoardOffices — Lakeland is not a market", () => {
  it("sums LAKE_MKT into the Orlando row and relabels canonically", () => {
    const merged = mergeBoardOffices([
      office("ORL_MKT", "Orlando", 10, 6, 2),
      office("LAKE_MKT", "Lakeland", 4, 3, 1),
      office("SAR_MKT", "Sarasota", 8, 8),
    ]);
    expect(merged).toHaveLength(2);
    const orlando = merged.find((o) => o.market === "ORL_MKT")!;
    expect(orlando.office_label).toBe("Orlando");
    expect(orlando.requested).toBe(14);
    expect(orlando.confirmed).toBe(9);
    expect(orlando.set_pending).toBe(3);
    expect(orlando.fill_pct).toBe(64); // 9/14 re-derived, not averaged
    expect(merged.some((o) => /lake/i.test(o.office_label))).toBe(false);
  });

  it("keeps unknown codes visible and untouched", () => {
    const merged = mergeBoardOffices([office("MYSTERY_MKT", "Mystery", 5, 2)]);
    expect(merged[0]?.market).toBe("MYSTERY_MKT");
    expect(merged[0]?.office_label).toBe("Mystery");
  });

  it("zero-slot merged row yields null fill_pct, never NaN", () => {
    const merged = mergeBoardOffices([
      office("ORL_MKT", "Orlando", 0, 0),
      office("LAKE_MKT", "Lakeland", 0, 0),
    ]);
    expect(merged[0]?.fill_pct).toBeNull();
  });
});
