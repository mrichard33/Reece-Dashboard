import { describe, expect, it } from "vitest";
import {
  SCORECARD_MARKETS,
  OFFICE_SOURCE_CODES,
  UTILITY_MARKETS,
  normalizeMarketCode,
  marketSources,
  marketLabel,
} from "./markets";

describe("SCORECARD_MARKETS — single source of truth (handoff test 7)", () => {
  it("lists exactly 6 display markets with no separate Lakeland entry", () => {
    expect(SCORECARD_MARKETS).toHaveLength(6);
    expect(SCORECARD_MARKETS.map((m) => m.label)).toEqual([
      "St. Petersburg",
      "Orlando",
      "Fort Myers",
      "Jacksonville",
      "Sarasota",
      "Fort Lauderdale",
    ]);
    expect(SCORECARD_MARKETS.find((m) => m.label === "Lakeland")).toBeUndefined();
  });

  it("Orlando sums ORL_MKT + LAKE_MKT; every other market is single-source", () => {
    const orlando = SCORECARD_MARKETS.find((m) => m.code === "ORL_MKT")!;
    expect([...orlando.sources]).toEqual(["ORL_MKT", "LAKE_MKT"]);
    for (const m of SCORECARD_MARKETS) {
      if (m.code !== "ORL_MKT") expect(m.sources).toEqual([m.code]);
    }
  });

  it("OFFICE_SOURCE_CODES covers all 7 warehouse codes (incl. LAKE_MKT)", () => {
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
});

describe("normalizeMarketCode", () => {
  it("collapses LAKE_MKT onto Orlando and trims/uppercases input", () => {
    expect(normalizeMarketCode("LAKE_MKT")).toBe("ORL_MKT");
    expect(normalizeMarketCode(" lake_mkt ")).toBe("ORL_MKT");
    expect(normalizeMarketCode("ORL_MKT")).toBe("ORL_MKT");
  });

  it("passes unknown codes through so they surface visibly, never silently merge", () => {
    expect(normalizeMarketCode("BOCA_MKT")).toBe("BOCA_MKT");
    expect(normalizeMarketCode("UNASSIGNED")).toBe("UNASSIGNED");
  });
});

describe("marketSources / marketLabel", () => {
  it("resolves sources for display codes, legacy codes, and REECE", () => {
    expect([...marketSources("ORL_MKT")]).toEqual(["ORL_MKT", "LAKE_MKT"]);
    expect([...marketSources("LAKE_MKT")]).toEqual(["ORL_MKT", "LAKE_MKT"]);
    expect([...marketSources("SAR_MKT")]).toEqual(["SAR_MKT"]);
    expect([...marketSources("REECE")]).toEqual(["REECE"]);
    expect([...marketSources("")]).toEqual(["REECE"]);
  });

  it("labels Orlando for both ORL and legacy LAKE codes; utility rows keep names", () => {
    expect(marketLabel("ORL_MKT")).toBe("Orlando");
    expect(marketLabel("LAKE_MKT")).toBe("Orlando");
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
