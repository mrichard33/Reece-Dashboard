/**
 * Market ranking — normalize to RATES, never totals.
 *
 * Fort Myers sells $23.1M; Fort Lauderdale sells $4.7M. Ranked on totals, Fort
 * Myers wins every table forever and Fort Lauderdale is permanently "worst" —
 * which means the largest market is never scrutinized (its size hides a bad
 * close rate) and the smallest is never defensible (its rates can be excellent
 * and it still finishes last). Neither market gets managed on the truth.
 *
 * So markets rank on Close %, Survival %, NSLI and Cost per Sale. Volume still
 * renders — you cannot size an opportunity without it — but as a visually
 * SECONDARY column that never drives sort order.
 */
import type { Measured } from "./types";

export type RankMetricKey = "close" | "survival" | "nsli" | "cost_per_sale";

export type RankMetricDef = {
  key: RankMetricKey;
  label: string;
  /** Cost per sale is the one metric where lower is better. */
  lowerIsBetter: boolean;
  unit: "pct" | "usd";
};

export const RANK_METRICS: readonly RankMetricDef[] = [
  { key: "close", label: "Close %", lowerIsBetter: false, unit: "pct" },
  { key: "survival", label: "Survival %", lowerIsBetter: false, unit: "pct" },
  { key: "nsli", label: "NSLI", lowerIsBetter: false, unit: "usd" },
  { key: "cost_per_sale", label: "Cost / sale", lowerIsBetter: true, unit: "usd" },
];

export type RankableMarket = {
  market: string;
  label: string;
  metrics: Partial<Record<RankMetricKey, Measured>>;
  /** Secondary — displayed, never sorted on. */
  volume: { netSold: number | null; sold: number | null };
};

export type RankedMarket = RankableMarket & {
  /** 1-based rank on the active metric; null when the metric is unmeasurable. */
  rank: number | null;
};

/**
 * Sort markets by one rate metric. Unmeasurable markets sink to the bottom
 * WITHOUT a rank rather than being silently treated as zero — a market with no
 * data is not a market performing badly, and ranking it last says it is.
 */
export function rankMarkets(
  markets: readonly RankableMarket[],
  metric: RankMetricKey,
): RankedMarket[] {
  const def = RANK_METRICS.find((m) => m.key === metric) ?? RANK_METRICS[0]!;
  const valueOf = (m: RankableMarket): number | null => {
    const v = m.metrics[metric];
    return v && v.known ? v.value : null;
  };

  const measurable = markets.filter((m) => valueOf(m) != null);
  const unmeasurable = markets.filter((m) => valueOf(m) == null);

  measurable.sort((a, b) => {
    const av = valueOf(a)!;
    const bv = valueOf(b)!;
    if (av === bv) return a.label.localeCompare(b.label);
    return def.lowerIsBetter ? av - bv : bv - av;
  });

  return [
    ...measurable.map((m, i) => ({ ...m, rank: i + 1 })),
    ...unmeasurable
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((m) => ({ ...m, rank: null })),
  ];
}

export function isRankMetric(v: string | null | undefined): v is RankMetricKey {
  return v === "close" || v === "survival" || v === "nsli" || v === "cost_per_sale";
}
