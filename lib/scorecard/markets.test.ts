import { describe, expect, it } from "vitest";
import {
  SCORECARD_MARKETS,
  DISPLAY_MARKETS,
  OFFICE_SOURCE_CODES,
  UTILITY_MARKETS,
  LEGACY_CODE_ALIASES,
  displayMarketOf,
  normalizeMarketCode,
  marketSources,
  marketLabel,
} from "./markets";

describe("SCORECARD_MARKETS — single source of truth (handoff test 7)", () => {
  it("lists exactly 6 display markets — Lakeland merged into Orlando", () => {
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
    expect(SCORECARD_MARKETS.find((m) => m.code === "LAKE_MKT")).toBeUndefined();
  });

  // LAKELAND IS ORLANDO (ruling 2026-09-28) — reverses the 2026-08-06 split.
  // The merge is in the warehouse (LP-MCP sql/135). LAKE_MKT is a legacy alias
  // for display folding only, never a source: a source would put a hidden
  // Lakeland row into the goal editor and the company goal rollup.
  it("Orlando is single-source; LAKE_MKT is a legacy alias, not a source", () => {
    const orlando = SCORECARD_MARKETS.find((m) => m.code === "ORL_MKT")!;
    expect([...orlando.sources]).toEqual(["ORL_MKT"]);
    expect(LEGACY_CODE_ALIASES.LAKE_MKT).toBe("ORL_MKT");
  });

  it("every market is 1:1 with its own warehouse code", () => {
    for (const m of SCORECARD_MARKETS) expect([...m.sources]).toEqual([m.code]);
  });

  it("OFFICE_SOURCE_CODES covers the 6 warehouse codes — no LAKE_MKT goal row", () => {
    expect([...OFFICE_SOURCE_CODES].sort()).toEqual([
      "FTLAU_MKT",
      "FTMYR_MKT",
      "JAX_MKT",
      "ORL_MKT",
      "SAR_MKT",
      "STPET_MKT",
    ]);
  });

  it("DISPLAY_MARKETS has no Lakeland entry", () => {
    const codes = DISPLAY_MARKETS.map((m) => m.code);
    expect(codes).not.toContain("LAKE_MKT");
    expect(codes).toHaveLength(7); // 6 markets + UNASSIGNED
  });
});

describe("normalizeMarketCode", () => {
  it("folds a stray LAKE_MKT onto Orlando and trims/uppercases input", () => {
    expect(normalizeMarketCode("LAKE_MKT")).toBe("ORL_MKT");
    expect(normalizeMarketCode(" lake_mkt ")).toBe("ORL_MKT");
    expect(normalizeMarketCode("ORL_MKT")).toBe("ORL_MKT");
  });

  it("passes unknown codes through so they surface visibly, never silently merge", () => {
    expect(normalizeMarketCode("BOCA_MKT")).toBe("BOCA_MKT");
    expect(normalizeMarketCode("UNASSIGNED")).toBe("UNASSIGNED");
  });
});

describe("displayMarketOf", () => {
  it("collapses a straggling Lakeland fact row into Orlando", () => {
    expect(displayMarketOf("LAKE_MKT")).toBe("ORL_MKT");
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
    expect([...marketSources("LAKE_MKT")]).toEqual(["ORL_MKT"]); // legacy alias → Orlando
    expect([...marketSources("SAR_MKT")]).toEqual(["SAR_MKT"]);
    expect([...marketSources("REECE")]).toEqual(["REECE"]);
    expect([...marketSources("")]).toEqual(["REECE"]);
  });

  it("resolves the utility row's BOTH source codes, not just its own", () => {
    // marketSources used to consult only SCORECARD_MARKETS while
    // displayMarketOf folded OUT_OF_AREA → UNASSIGNED. A facts read filtered to
    // UNASSIGNED therefore dropped every OUT_OF_AREA row — 1,084 YTD leads.
    // Two functions disagreeing about one cardinality ruling is exactly what
    // that ruling exists to prevent.
    expect([...marketSources("UNASSIGNED")]).toEqual(["UNASSIGNED", "OUT_OF_AREA"]);
    expect([...marketSources("OUT_OF_AREA")]).toEqual(["UNASSIGNED", "OUT_OF_AREA"]);
  });

  it("marketSources and displayMarketOf agree for every code either knows", () => {
    const codes = [
      ...SCORECARD_MARKETS.map((m) => m.code),
      ...UTILITY_MARKETS.flatMap((m) => [m.code, ...m.sources]),
    ];
    for (const c of codes) {
      // Every source of a code's display market must itself resolve back to it.
      const display = displayMarketOf(c);
      for (const src of marketSources(display)) {
        expect(displayMarketOf(src), `${src} → ${display}`).toBe(display);
      }
    }
  });

  it("labels Orlando — and a stray LAKE_MKT — as Orlando (merged 2026-09-28)", () => {
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
