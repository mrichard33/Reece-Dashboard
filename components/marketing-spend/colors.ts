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
