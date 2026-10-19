import type { CostCategory } from "@/lib/queries/marketingSpend.core";

/** One fixed color per category (CSS variables in app/globals.css flip with dark mode). */
export const CATEGORY_COLOR: Record<CostCategory, string> = {
  lead_source: "var(--chart-cat-1)",
  software: "var(--chart-cat-2)",
  call_center: "var(--chart-cat-3)",
  company_wide: "var(--chart-cat-4)",
  held: "var(--chart-cat-5)",
  // Disputed money is the exception, not a seventh category: the brand red.
  disputed: "var(--chart-accent)",
};

/**
 * One fixed color per office for the 12-month chart's "By office" view, in
 * SCORECARD_MARKETS order (the validated --chart-cat palette, 2026-10-19), so an
 * office keeps its color whichever offices have money that month. Other markets
 * and Held are neutral grays; Disputed is the brand red, as everywhere.
 */
export const MARKET_TREND_COLOR: Record<string, string> = {
  STPET_MKT: "var(--chart-cat-1)",
  ORL_MKT: "var(--chart-cat-2)",
  FTMYR_MKT: "var(--chart-cat-3)",
  JAX_MKT: "var(--chart-cat-4)",
  SAR_MKT: "var(--chart-cat-5)",
  FTLAU_MKT: "var(--chart-cat-6)",
  OTHER: "#626060",
  REECE_HOLD: "#6588A0",
  DISPUTED: "var(--chart-accent)",
};
