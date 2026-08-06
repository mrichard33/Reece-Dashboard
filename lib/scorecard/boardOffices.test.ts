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

describe("mergeBoardOffices — Lakeland is its own tile", () => {
  // LAKELAND RULING (2026-08-06): the capacity board carried a SECOND,
  // independent fold — LAKE_MKT's slots summed into the Orlando tile and its
  // "Lakeland" label was overwritten with "Orlando". Both are gone.
  it("keeps LAKE_MKT separate from Orlando with its own label and counts", () => {
    const merged = mergeBoardOffices([
      office("ORL_MKT", "Orlando", 10, 6, 2),
      office("LAKE_MKT", "Lakeland", 4, 3, 1),
      office("SAR_MKT", "Sarasota", 8, 8),
    ]);
    expect(merged).toHaveLength(3);

    const orlando = merged.find((o) => o.market === "ORL_MKT")!;
    expect(orlando.office_label).toBe("Orlando");
    expect(orlando.requested).toBe(10);
    expect(orlando.confirmed).toBe(6);
    expect(orlando.set_pending).toBe(2);
    expect(orlando.fill_pct).toBe(60); // 6/10 — Lakeland's 4/3 never mixed in

    const lakeland = merged.find((o) => o.market === "LAKE_MKT")!;
    expect(lakeland.office_label).toBe("Lakeland");
    expect(lakeland.requested).toBe(4);
    expect(lakeland.confirmed).toBe(3);
    expect(lakeland.set_pending).toBe(1);
    expect(lakeland.fill_pct).toBe(75); // 3/4 re-derived from its own counts
  });

  it("renders the word Lakeland somewhere on the board", () => {
    const merged = mergeBoardOffices([office("LAKE_MKT", "Lakeland", 4, 3)]);
    expect(merged.some((o) => /lake/i.test(o.office_label))).toBe(true);
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
