import { describe, expect, it } from "vitest";
import {
  SCORECARD_MARKETS,
  DISPLAY_MARKETS,
  OFFICE_SOURCE_CODES,
  UTILITY_MARKETS,
  displayMarketOf,
  normalizeMarketCode,
  marketSources,
  marketLabel,
} from "./markets";

describe("SCORECARD_MARKETS — single source of truth (handoff test 7)", () => {
  it("lists exactly 7 display markets, Lakeland among them", () => {
    expect(SCORECARD_MARKETS).toHaveLength(7);
    expect(SCORECARD_MARKETS.map((m) => m.label)).toEqual([
      "St. Petersburg",
      "Orlando",
      "Fort Myers",
      "Jacksonville",
      "Sarasota",
      "Fort Lauderdale",
      "Lakeland",
    ]);
    expect(SCORECARD_MARKETS.find((m) => m.label === "Lakeland")).toBeDefined();
  });

  // LAKELAND RULING (2026-08-06) — reverses the 2026-08-04 Orlando fold.
  // Lakeland is its own market; no LAKE number is ever summed into Orlando.
  it("Orlando is single-source; Lakeland is its own market, not an Orlando source", () => {
    const orlando = SCORECARD_MARKETS.find((m) => m.code === "ORL_MKT")!;
    expect([...orlando.sources]).toEqual(["ORL_MKT"]);
    expect(orlando.sources).not.toContain("LAKE_MKT");

    const lakeland = SCORECARD_MARKETS.find((m) => m.code === "LAKE_MKT")!;
    expect(lakeland.label).toBe("Lakeland");
    expect([...lakeland.sources]).toEqual(["LAKE_MKT"]);
  });

  it("every market is 1:1 with its own warehouse code", () => {
    for (const m of SCORECARD_MARKETS) expect([...m.sources]).toEqual([m.code]);
  });

  it("OFFICE_SOURCE_CODES covers all 7 warehouse codes", () => {
    expect([...OFFICE_SOURCE_CODES].sort()).toEqual([
      "FTLAU_MKT",
      "FTMYR_MKT",
      "JAX_MKT",
      "LAKE_MKT",
      "ORL_MKT",
      "SAR_MKT",
      "STPET_MKT",
    ]);
  });

  it("DISPLAY_MARKETS renders Lakeland as its own entry", () => {
    const codes = DISPLAY_MARKETS.map((m) => m.code);
    expect(codes).toContain("LAKE_MKT");
    expect(codes).toHaveLength(8); // 7 markets + UNASSIGNED
    expect(DISPLAY_MARKETS.find((m) => m.code === "LAKE_MKT")!.label).toBe("Lakeland");
  });
});

describe("normalizeMarketCode", () => {
  it("keeps LAKE_MKT as its own market and trims/uppercases input", () => {
    expect(normalizeMarketCode("LAKE_MKT")).toBe("LAKE_MKT");
    expect(normalizeMarketCode(" lake_mkt ")).toBe("LAKE_MKT");
    expect(normalizeMarketCode("ORL_MKT")).toBe("ORL_MKT");
  });

  it("passes unknown codes through so they surface visibly, never silently merge", () => {
    expect(normalizeMarketCode("BOCA_MKT")).toBe("BOCA_MKT");
    expect(normalizeMarketCode("UNASSIGNED")).toBe("UNASSIGNED");
  });
});

describe("displayMarketOf", () => {
  it("never collapses a Lakeland fact row into Orlando", () => {
    expect(displayMarketOf("LAKE_MKT")).toBe("LAKE_MKT");
    expect(displayMarketOf("ORL_MKT")).toBe("ORL_MKT");
  });

  it("still folds the utility codes onto one UNASSIGNED row", () => {
    expect(displayMarketOf("OUT_OF_AREA")).toBe("UNASSIGNED");
    expect(displayMarketOf("")).toBe("UNASSIGNED");
    expect(displayMarketOf(null)).toBe("UNASSIGNED");
  });
});

describe("marketSources / marketLabel", () => {
  it("resolves sources for display codes and REECE", () => {
    expect([...marketSources("ORL_MKT")]).toEqual(["ORL_MKT"]);
    expect([...marketSources("LAKE_MKT")]).toEqual(["LAKE_MKT"]);
    expect([...marketSources("SAR_MKT")]).toEqual(["SAR_MKT"]);
    expect([...marketSources("REECE")]).toEqual(["REECE"]);
    expect([...marketSources("")]).toEqual(["REECE"]);
  });

  it("labels Lakeland as Lakeland — never Orlando", () => {
    expect(marketLabel("ORL_MKT")).toBe("Orlando");
    expect(marketLabel("LAKE_MKT")).toBe("Lakeland");
    expect(marketLabel("REECE")).toBe("All Markets");
    expect(marketLabel(null)).toBe("All Markets");
    expect(marketLabel("UNASSIGNED")).toBe("Unassigned");
    expect(marketLabel("MYSTERY")).toBe("MYSTERY");
    // CARDINALITY RULING (2026-08-05 §7): UNASSIGNED and OUT_OF_AREA were two
    // warehouse codes for one idea, and two labels for one concept made two
    // tiers show two different market lists. They are now ONE utility entity
    // with both codes as sources.
    expect(UTILITY_MARKETS).toHaveLength(1);
    expect([...UTILITY_MARKETS[0]!.sources]).toEqual(["UNASSIGNED", "OUT_OF_AREA"]);
    expect(marketLabel("OUT_OF_AREA")).toBe("Unassigned");
  });
});
