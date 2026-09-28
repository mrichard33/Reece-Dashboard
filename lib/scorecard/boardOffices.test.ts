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

describe("mergeBoardOffices — Lakeland is part of Orlando", () => {
  // LAKELAND IS ORLANDO (ruling 2026-09-28): the warehouse already folds branch
  // LAKE into ORL_MKT, so the board should never see LAKE_MKT. If a straggling
  // row does arrive, it sums into Orlando's tile — never a separate tile.
  it("folds a stray LAKE_MKT row into the Orlando tile", () => {
    const merged = mergeBoardOffices([
      office("ORL_MKT", "Orlando", 10, 6, 2),
      office("LAKE_MKT", "Lakeland", 4, 3, 1),
      office("SAR_MKT", "Sarasota", 8, 8),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.some((o) => o.market === "LAKE_MKT")).toBe(false);

    const orlando = merged.find((o) => o.market === "ORL_MKT")!;
    expect(orlando.office_label).toBe("Orlando");
    expect(orlando.requested).toBe(14);
    expect(orlando.confirmed).toBe(9);
    expect(orlando.set_pending).toBe(3);
    expect(orlando.fill_pct).toBe(64); // 9/14 re-derived from the summed counts
  });

  it("never renders a Lakeland tile", () => {
    const merged = mergeBoardOffices([office("LAKE_MKT", "Lakeland", 4, 3)]);
    expect(merged.some((o) => /lake/i.test(o.office_label))).toBe(false);
    expect(merged[0]?.office_label).toBe("Orlando");
  });

  it("keeps unknown codes visible and untouched", () => {
    const merged = mergeBoardOffices([office("MYSTERY_MKT", "Mystery", 5, 2)]);
    expect(merged[0]?.market).toBe("MYSTERY_MKT");
    expect(merged[0]?.office_label).toBe("Mystery");
  });

  it("zero-slot row yields null fill_pct, never NaN", () => {
    const merged = mergeBoardOffices([
      office("ORL_MKT", "Orlando", 0, 0),
      office("LAKE_MKT", "Lakeland", 0, 0),
    ]);
    expect(merged.every((o) => o.fill_pct === null)).toBe(true);
  });

  it("still normalizes a row that arrives under a folded SOURCE code", () => {
    // Fort Lauderdale is the one remaining merged market (BOCA/MIAMI/RFED fold
    // upstream). If an upstream row ever arrives under a source code, it must
    // still land on the display tile rather than appearing as a stray market.
    const merged = mergeBoardOffices([
      office("FTLAU_MKT", "Fort Lauderdale", 6, 3),
      office("FTLAU_MKT", "Boca", 4, 1),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.requested).toBe(10);
    expect(merged[0]?.confirmed).toBe(4);
    expect(merged[0]?.office_label).toBe("Fort Lauderdale");
  });
});
