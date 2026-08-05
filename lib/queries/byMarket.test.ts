import { describe, expect, it } from "vitest";
import { rowHasActivity, type ByMarketRow } from "./byMarket";

/**
 * Guard for the utility-row suppression rule. The old check summed only
 * counts + gross, so an UNASSIGNED row holding only net dollars was silently
 * dropped from the By-Market table — hiding exactly the line that must stay
 * visible until it's driven to zero (handoff 2026-08-05).
 */

const row = (over: Partial<ByMarketRow>): ByMarketRow => ({
  market: "UNASSIGNED",
  label: "Unassigned",
  utility: true,
  leads: 0,
  issued: 0,
  demos: 0,
  sales: 0,
  close_pct: null,
  gross_sales: 0,
  net_sales: 0,
  goal: null,
  pctToGoal: null,
  ...over,
});

describe("rowHasActivity", () => {
  it("a truly empty utility row is suppressed", () => {
    expect(rowHasActivity(row({}))).toBe(false);
  });
  it("counts alone surface the row", () => {
    expect(rowHasActivity(row({ leads: 3 }))).toBe(true);
  });
  it("REGRESSION: net dollars alone surface the row (was silently dropped)", () => {
    expect(rowHasActivity(row({ net_sales: 34_400 }))).toBe(true);
  });
  it("gross dollars alone surface the row", () => {
    expect(rowHasActivity(row({ gross_sales: 12_000 }))).toBe(true);
  });
});
