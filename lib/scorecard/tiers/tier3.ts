/**
 * TIER 3 — Revenue leakage.  Basis: sold cohort.  Source: `sales_efficiency` YTD.
 *
 * $81.1M gross sold became $54.1M net. $27.0M evaporated. One in three sold
 * dollars never becomes revenue — a larger lever than anything upstream in lead
 * generation, which is why this is its own tier and not a sub-line under a
 * "Good Business" panel.
 *
 * CREDIT DECLINE is the line this tier exists to surface: $7.5M across 333
 * households who sat a demo, said yes, and could not finance. That is a
 * targeting or lender-mix failure, it is marketing-owned, and it is completely
 * invisible on the current dashboard.
 *
 * TREND IS THE POINT. A rising credit-decline rate is the earliest available
 * signal that lead quality is degrading — earlier than close rate, earlier than
 * cost per sale. The level tells you what happened; the arrow tells you what is
 * about to.
 *
 * RECONCILIATION: Gross − Σleaks + unreconciled = Net, exactly. The residual is
 * rendered as its own named line and NEVER absorbed into a bucket to force a
 * tie — a forced tie silently attributes dollars to a cause that did not
 * produce them, which is worse than an admitted gap.
 */
import { measured, unmeasured, type Measured, type TierMeta } from "./types";
import { rate } from "./metrics";
import type { TimeToNetStat } from "./metrics";
import { dollarsOf, forMarket, pickSnapshot, sumMetric, type RolledFact } from "./factRollup";

export type LeakKey = "cancelled" | "credit_decline" | "working_open" | "hold";

export type LeakDef = { key: LeakKey; label: string; metric: string; note: string };

/** The four leak buckets, largest-lever first. */
export const LEAKS: readonly LeakDef[] = [
  {
    key: "cancelled",
    label: "Cancelled",
    metric: "cancelled",
    note: "Sold, then cancelled. Sales-quality and rescission exposure.",
  },
  {
    key: "credit_decline",
    label: "Credit decline",
    metric: "credit_decline",
    note: "Sat, said yes, could not finance. Targeting or lender-mix — marketing-owned.",
  },
  {
    key: "working_open",
    label: "Working / pending",
    metric: "working_open",
    note: "Still open on the sold cohort — recoverable, not yet lost.",
  },
  {
    key: "hold",
    label: "Held — HOA",
    metric: "hold",
    note: "Blocked on HOA approval. A workflow queue, not a lost sale.",
  },
];

export type LeakRow = {
  key: LeakKey;
  label: string;
  note: string;
  count: Measured;
  dollars: Measured;
  /** Leak dollars as a % of gross sold. */
  pctOfGross: Measured;
  /** Month-over-month change in pctOfGross, in points. */
  trendPts: Measured;
};

export type Tier3 = {
  meta: TierMeta;
  grossSold: Measured;
  netSold: Measured;
  /** Gross − Net. The headline "$27.0M evaporated". */
  totalLeak: Measured;
  leaks: LeakRow[];
  leakSubtotal: Measured;
  /**
   * Net − (Gross − Σleaks). A NAMED line, never folded into a bucket.
   * +$246,768 as of 2026-08-05: the buckets over-count by that much, meaning
   * some jobs appear in a leak bucket yet still carry net dollars.
   */
  unreconciled: Measured;
  /** True when Gross − Σleaks + unreconciled = Net to the cent. */
  reconciles: boolean;
  timeToNet: { company: TimeToNetStat; markets: TimeToNetStat[]; sampleNote: string };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build Tier 3 for one market (or the company).
 *
 * `priorRolled` supplies the previous month's snapshot for the trend arrow;
 * pass an empty array when no prior month exists yet and every arrow renders
 * "—" with the reason stated, rather than a fabricated flat trend.
 */
export function buildTier3(
  rolled: readonly RolledFact[],
  timeToNet: { company: TimeToNetStat; markets: TimeToNetStat[]; sampleNote: string },
  opts: { market: string; priorRolled?: readonly RolledFact[]; priorLabel?: string },
): Tier3 {
  const snap = forMarket(pickSnapshot(rolled, "sales_efficiency", "ytd"), opts.market);
  const asOf = snap[0]?.as_of_date ?? null;

  const soldSum = sumMetric(snap, "sold");
  const netSum = sumMetric(snap, "net_sold");
  const grossDollars = soldSum.seen ? dollarsOf(soldSum.cents) : null;
  const netDollars = netSum.seen ? dollarsOf(netSum.cents) : null;

  const NO_SNAP = "no year-to-date Sales Efficiency snapshot for this market";
  const grossSold = grossDollars == null ? unmeasured(NO_SNAP) : measured(round2(grossDollars));
  const netSold = netDollars == null ? unmeasured(NO_SNAP) : measured(round2(netDollars));

  const priorSnap = opts.priorRolled?.length
    ? forMarket(pickSnapshot(opts.priorRolled, "sales_efficiency", "mtd"), opts.market)
    : [];
  const priorGross = priorSnap.length ? dollarsOf(sumMetric(priorSnap, "sold").cents) : null;
  const noTrend = opts.priorLabel
    ? `no ${opts.priorLabel} snapshot yet — trend starts when the next month's report lands`
    : "no prior-month snapshot yet — trend starts when the next month's report lands";

  const leaks: LeakRow[] = LEAKS.map((def) => {
    const s = sumMetric(snap, def.metric);
    const d = s.seen ? dollarsOf(s.cents) : null;
    const dollars = d == null ? unmeasured(NO_SNAP) : measured(round2(d));
    const pctOfGross =
      d == null || grossDollars == null
        ? unmeasured(NO_SNAP)
        : rate(d, grossDollars, `${def.label} share of gross`);

    let trendPts: Measured = unmeasured(noTrend);
    if (priorSnap.length && priorGross != null && priorGross > 0 && pctOfGross.known) {
      const pd = dollarsOf(sumMetric(priorSnap, def.metric).cents);
      if (pd != null) {
        const priorPct = (pd / priorGross) * 100;
        trendPts = measured(Math.round((pctOfGross.value - priorPct) * 10) / 10);
      }
    }

    return {
      key: def.key,
      label: def.label,
      note: def.note,
      count: s.seen ? measured(s.count) : unmeasured(NO_SNAP),
      dollars,
      pctOfGross,
      trendPts,
    };
  });

  const subtotalDollars = leaks.reduce<number | null>(
    (acc, l) => (l.dollars.known ? round2((acc ?? 0) + l.dollars.value) : acc),
    null,
  );
  const leakSubtotal =
    subtotalDollars == null ? unmeasured(NO_SNAP) : measured(round2(subtotalDollars));

  const totalLeak =
    grossSold.known && netSold.known
      ? measured(round2(grossSold.value - netSold.value))
      : unmeasured(NO_SNAP);

  // Net − (Gross − Σleaks): positive means the buckets over-count.
  const unreconciled =
    grossSold.known && netSold.known && leakSubtotal.known
      ? measured(round2(netSold.value - (grossSold.value - leakSubtotal.value)))
      : unmeasured(NO_SNAP);

  const reconciles =
    grossSold.known &&
    netSold.known &&
    leakSubtotal.known &&
    unreconciled.known &&
    Math.abs(grossSold.value - leakSubtotal.value + unreconciled.value - netSold.value) < 0.005;

  return {
    meta: {
      tier: 3,
      title: "Revenue leakage",
      question: "Where do sold dollars go before they become revenue?",
      basis: "appointment",
      basisDetail: `sold cohort · year to date${asOf ? ` · as of ${asOf}` : ""}`,
      source: "Sales Efficiency (137), YTD",
    },
    grossSold,
    netSold,
    totalLeak,
    leaks,
    leakSubtotal,
    unreconciled,
    reconciles,
    timeToNet,
  };
}
