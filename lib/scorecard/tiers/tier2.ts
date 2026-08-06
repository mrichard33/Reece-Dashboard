/**
 * TIER 2 — Where it's breaking.  Basis: appointment date.
 * Source: `sales_efficiency` (period flow) + `lead_disposition` (leads).
 *
 * The conversion cascade, per market and company. Four stages, each with an
 * ACTUAL, a TARGET, a variance in points — and an OWNER.
 *
 * The owner column is the point of the tier. An outcome tells leadership they
 * missed; a stage variance with a name against it says who to call. The visual
 * anchor is therefore the variance cell, not the raw volume: volume tells you
 * how big the market is, variance tells you where to intervene.
 *
 * TARGET = the company's own YTD rate for that stage. Not an aspiration
 * invented for the page, and not a stored target that quietly goes stale — the
 * benchmark is what the business actually did this year, so "behind" always
 * means "worse than our own year to date" and is defensible in the room.
 */
import { measured, unmeasured, type Measured, type Owner, type TierMeta } from "./types";
import { marketLabel } from "@/lib/scorecard/markets";
import { pointsGap, rate } from "./metrics";
import type { FactScope } from "@/lib/queries/reportFacts.core";
import { forMarket, pickSnapshot, sumMetric, type RolledFact } from "./factRollup";

export type StageKey = "issue" | "sit" | "close" | "survival";

export type StageDef = {
  key: StageKey;
  label: string;
  formula: string;
  owner: Owner;
};

/** The cascade, in funnel order. Owners are the escalation path on a miss. */
export const STAGES: readonly StageDef[] = [
  { key: "issue", label: "Issue %", formula: "Issued ÷ Leads", owner: "Marketing / call center" },
  { key: "sit", label: "Sit %", formula: "Sat ÷ Issued", owner: "Call center" },
  { key: "close", label: "Close %", formula: "Sold ÷ Sat", owner: "Sales" },
  { key: "survival", label: "Survival %", formula: "Net ÷ Sold", owner: "Finance / Operations" },
];

export type CascadeStage = {
  key: StageKey;
  label: string;
  formula: string;
  owner: Owner;
  /** Stage numerator/denominator volumes — rendered visually secondary. */
  numerator: number | null;
  denominator: number | null;
  actual: Measured;
  target: Measured;
  /** actual − target, in percentage points. Null when either side is absent. */
  variancePts: number | null;
};

export type Tier2Row = {
  market: string;
  label: string;
  isCompany: boolean;
  stages: CascadeStage[];
};

export type Tier2 = {
  meta: TierMeta;
  rows: Tier2Row[];
  company: Tier2Row;
  /** Absolute volumes for the company cascade — the funnel's shape. */
  companyVolumes: { leads: number | null; issued: number; sat: number; sold: number; net: number | null };
  scope: FactScope;
};

type Counts = {
  leads: number | null;
  issued: number | null;
  sat: number | null;
  sold: number | null;
  net: number | null;
};

const MISSING: Record<StageKey, string> = {
  issue: "no Lead Disposition snapshot covering this window — raw lead count unavailable",
  sit: "no Sales Efficiency snapshot covering this window",
  close: "no Sales Efficiency snapshot covering this window",
  survival:
    "this window's Net column is still maturing — jobs sold in the period have not netted yet",
};

/** Pull the five cascade volumes for one market at one scope. */
function countsFor(
  rolled: readonly RolledFact[],
  marketCode: string,
  scope: FactScope,
): Counts {
  const se = forMarket(pickSnapshot(rolled, "sales_efficiency", scope), marketCode);
  const ld = forMarket(pickSnapshot(rolled, "lead_disposition", scope), marketCode);
  const pick = (rows: readonly RolledFact[], metric: string): number | null => {
    const s = sumMetric(rows, metric);
    return s.seen ? s.count : null;
  };
  return {
    leads: pick(ld, "leads"),
    issued: pick(se, "issued"),
    sat: pick(se, "sat"),
    sold: pick(se, "sold"),
    net: pick(se, "net_sold"),
  };
}

/** The four stage ratios from a set of volumes. */
function stagesFrom(c: Counts, targets: Partial<Record<StageKey, number>>): CascadeStage[] {
  const pairs: Record<StageKey, [number | null, number | null]> = {
    issue: [c.issued, c.leads],
    sit: [c.sat, c.issued],
    close: [c.sold, c.sat],
    survival: [c.net, c.sold],
  };
  return STAGES.map((s) => {
    const [numerator, denominator] = pairs[s.key];
    const actual: Measured =
      numerator == null || denominator == null
        ? unmeasured(MISSING[s.key])
        : rate(numerator, denominator, s.label);
    const t = targets[s.key];
    const target: Measured =
      t == null ? unmeasured("no year-to-date benchmark available yet") : measured(t);
    return {
      key: s.key,
      label: s.label,
      formula: s.formula,
      owner: s.owner,
      numerator,
      denominator,
      actual,
      target,
      variancePts: pointsGap(actual.known ? actual.value : null, target.known ? target.value : null),
    };
  });
}

/**
 * Build Tier 2 at the requested scope.
 *
 * Company rows are Σ-of-markets by construction: every rate is a ratio of the
 * summed numerator to the summed denominator, so Orlando is (ORL+LAKE issued) ÷
 * (ORL+LAKE leads) and the company is Σissued ÷ Σleads — never the mean of the
 * markets' rates, which would weight a 286-lead office equally with a
 * 5,427-lead one.
 */
export function buildTier2(
  rolled: readonly RolledFact[],
  opts: { scope: FactScope; markets: readonly string[]; periodLabel: string },
): Tier2 {
  // Benchmark: the company's own YTD cascade, always, regardless of the view's
  // scope. On a YTD view actual and target coincide by definition and the
  // variance column reads 0.0 — correct, and visibly so.
  const ytd = countsFor(rolled, "REECE", "ytd");
  const ytdStages = stagesFrom(ytd, {});
  const targets: Partial<Record<StageKey, number>> = {};
  for (const s of ytdStages) if (s.actual.known) targets[s.key] = s.actual.value;

  const rows: Tier2Row[] = opts.markets.map((code) => ({
    market: code,
    label: marketLabel(code),
    isCompany: false,
    stages: stagesFrom(countsFor(rolled, code, opts.scope), targets),
  }));

  const companyCounts = countsFor(rolled, "REECE", opts.scope);
  const company: Tier2Row = {
    market: "REECE",
    label: "All Markets",
    isCompany: true,
    stages: stagesFrom(companyCounts, targets),
  };

  const se = pickSnapshot(rolled, "sales_efficiency", opts.scope);
  const asOf = se[0]?.as_of_date ?? null;

  return {
    meta: {
      tier: 2,
      title: "Where it's breaking",
      question: "Which stage is losing us the month, and who owns it?",
      basis: "appointment",
      basisDetail: `${opts.periodLabel} flow vs company YTD rates${asOf ? ` · as of ${asOf}` : ""}`,
      source: "Sales Efficiency (137) + Lead Disposition (135)",
    },
    rows,
    company,
    companyVolumes: {
      leads: companyCounts.leads,
      issued: companyCounts.issued ?? 0,
      sat: companyCounts.sat ?? 0,
      sold: companyCounts.sold ?? 0,
      net: companyCounts.net,
    },
    scope: opts.scope,
  };
}
