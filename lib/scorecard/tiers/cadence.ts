/**
 * Cadence — three views, not one.
 *
 * The same figures should NOT appear at all three cadences. The current
 * dashboard tries to do the monthly job daily, which is how it ends up showing
 * pace variance on 2 elapsed days out of 26. Two days is not a signal, and
 * presenting it as one teaches leadership that the page overreacts — after
 * which they stop reading it, including on the days it is right.
 *
 *   Daily   — yesterday's volumes only. NO goal or pace math, at all.
 *   Weekly  — Tiers 1 and 2 by market. Where pace conversations happen.
 *   Monthly — all five tiers + source ROI + leak trend. Where budget and
 *             lender decisions get made.
 */
import type { ExecutiveContext } from "@/lib/auth";

export type CadenceKey = "daily" | "weekly" | "monthly";

export type CadenceDef = {
  key: CadenceKey;
  label: string;
  audience: string;
  /** Which tiers render, in order. */
  tiers: readonly number[];
  /** Daily is volume-only: goal, pace, projection and variance are suppressed. */
  showsGoalMath: boolean;
  /** Monthly only — source-level ROI and the leak trend column. */
  showsSourceRoi: boolean;
  blurb: string;
};

export const CADENCES: readonly CadenceDef[] = [
  {
    key: "daily",
    label: "Daily",
    audience: "The floor",
    tiers: [],
    showsGoalMath: false,
    showsSourceRoi: false,
    blurb:
      "Yesterday's volumes only. No goal or pace math — a single day is too noisy to pace against.",
  },
  {
    key: "weekly",
    label: "Weekly",
    audience: "Sales leadership",
    tiers: [1, 2],
    showsGoalMath: true,
    showsSourceRoi: false,
    blurb: "The number and the cascade, by market. Where pace conversations happen.",
  },
  {
    key: "monthly",
    label: "Monthly",
    audience: "Executive",
    tiers: [1, 2, 3, 4, 5],
    showsGoalMath: true,
    showsSourceRoi: true,
    blurb:
      "All five tiers, source-level ROI and the leak trend. Where budget shifts and lender decisions get made.",
  },
];

export const DEFAULT_CADENCE: CadenceKey = "weekly";

export function cadenceDef(key: CadenceKey): CadenceDef {
  return CADENCES.find((c) => c.key === key) ?? CADENCES[1]!;
}

export function isCadenceKey(v: string | null | undefined): v is CadenceKey {
  return v === "daily" || v === "weekly" || v === "monthly";
}

/**
 * Default cadence for the signed-in role.
 *
 * Executives land on Monthly (budget and lender decisions), operators on Weekly
 * (pace). Nobody is defaulted INTO Daily: it is a deliberate pick for the floor,
 * because landing an executive on a volume-only view with no goal math would
 * read as the page having lost the goal.
 */
export function defaultCadenceFor(ctx: ExecutiveContext | null): CadenceKey {
  if (!ctx) return DEFAULT_CADENCE;
  if (ctx.isExecutive) return "monthly";
  if (ctx.role === "operator") return "weekly";
  return DEFAULT_CADENCE;
}

/** Resolve the active cadence: explicit `?view=` wins, else the role default. */
export function resolveCadence(
  requested: string | undefined,
  ctx: ExecutiveContext | null,
): { cadence: CadenceDef; fromRole: boolean } {
  if (isCadenceKey(requested)) return { cadence: cadenceDef(requested), fromRole: false };
  return { cadence: cadenceDef(defaultCadenceFor(ctx)), fromRole: true };
}
