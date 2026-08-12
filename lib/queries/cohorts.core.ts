/**
 * Sales cohorts: what a contract month was worth, and what it turned into.
 *
 * Pure core — no DB imports, so it unit-tests in a plain node env. The wrapper
 * lives in `lib/queries/cohorts.ts` and re-exports everything here, so callers
 * have one import.
 *
 * ══ A COHORT IS THE MONTH THE CONTRACT WAS WRITTEN IN ══
 *
 * Immutably. A July contract stays July business forever; only its DISPOSITION
 * changes. Nothing here may ever add a maturing prior-month dollar to a current
 * month's figure — that is the single rule that makes cohort reporting mean
 * anything, and it is why Gross Written is treated as the fixed denominator
 * throughout.
 *
 * ══ THE DEFINITION — ONE FORMULA, AND IT IS A SUBTRACTION ══
 *
 *     Net Sales = Gross Written − Cancellations − Financing Denied
 *
 * Gross Written is the cohort's immutable defining figure; cancellations and
 * financing denials are the two TERMINAL losses. That is the whole formula.
 * Nothing else derives Net Sales, anywhere.
 *
 * ══ THE DISPOSITION — AN OBSERVATION, NOT AN IDENTITY ══
 *
 * Separately, LP reports how that business is currently sitting:
 *
 *     observed disposition = nsa + working + hold
 *          Matured = nsa             settled
 *          Pending = working + hold  still in play
 *
 * ⚠️ DO NOT WRITE `Net Sales = Pending + Matured`. It is very nearly true, and
 * that is exactly what makes it dangerous. Report 137 does not always foot:
 * measured 2026-08-12 the identity ties exactly on only two of eight cohorts,
 * and the sign of the miss flips between April and June. Writing it as an
 * equation silently promotes a DIAGNOSTIC OBSERVATION into a GUARANTEED
 * ACCOUNTING IDENTITY — and the whole reconciliation apparatus below exists
 * because LP guarantees no such thing.
 *
 * The gap between the definition and the observation is
 * `reconciliationDelta`. It is carried alongside both, and resolved into
 * neither. Net Sales does not move because the disposition disagrees with it,
 * and no rate is normalised to make them agree.
 *
 * ══ AN UNOBSERVED DISPOSITION IS UNKNOWN, NOT ZERO ══
 *
 * Report-137 pulls before 2026-08-09 have blank columns — the Net column
 * always, and on the earliest pulls most of the others too. A blank is not a
 * zero. Summing it to zero produces a maturation curve that climbs from 0% to
 * 71% and is pure ingest artifact. Every sum here is all-or-unknown: if one
 * input is null the total is null, because a total built from the inputs that
 * happened to report looks complete and is smaller than the truth.
 */

import { measured, unmeasured, type Measured } from "@/lib/scorecard/tiers/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tunables. Every one of these is a business judgement that will be revisited
// against the maturation series once it has points; none may be inlined at a
// call site.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How old a cohort must be to feed the mature-rate denominator.
 *
 * ANCHORED AT THE COHORT MONTH START — a cohort is `days` old when that many
 * days have passed since the first of its contract month. Measured this way on
 * 2026-08-11, Jan–May qualify and June (71 days) does not.
 *
 * This is an INCLUSION THRESHOLD, not a claim that a cohort is definitively
 * mature on day 90. It is provisional until the maturation series is long
 * enough to show where the rate actually stabilises. Do not rename it to imply
 * proven maturity.
 */
export const MATURE_RATE_ELIGIBILITY_DAYS = 90;

/**
 * When the waterfall identity misses by more than this share of Gross Written,
 * the observation carries a warning. 0.01 = 1%.
 *
 * A WARNING, NEVER A GATE. See `waterfallWarning` below.
 */
export const WATERFALL_DELTA_THRESHOLD = 0.01;

/**
 * Below this much Gross Written, a market does not get its own mature rate —
 * it falls back to the company rate and the cell is marked. A rate computed
 * from one or two contracts is noise presented as measurement.
 */
export const MIN_GROSS_FOR_OWN_RATE_CENTS = 200_000_00;

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One office's row of report 137 for one cohort at one observation.
 * Money in integer cents. Null means "the report did not carry this", which is
 * NOT zero.
 */
export type CohortOfficeRow = {
  contractMonth: string; // 'YYYY-MM-01'
  market: string; // '*_MKT'
  /**
   * When LP RAN the report. The maturation series is keyed on this — "what does
   * January look like as of the latest observation" is a question about when we
   * looked. ⚠️ NEVER date a current-period figure with it: report 137's MTD
   * files run the morning AFTER the day they cover, so this reads 08-11 over
   * data that stops 08-10.
   */
  observedOn: string; // 'YYYY-MM-DD'
  /**
   * How far the DATA reaches (`period_end`). Null when the file is partial or
   * its coverage is unknown, in which case it declares nothing and must not be
   * assumed. This is the only date a current-period actual may be paced against.
   */
  dataThrough: string | null;
  officeCode: string | null; // branch_code_raw — BOCA / FTLAU / MIAMI / …
  grossCents: number | null;
  nsaCents: number | null;
  workingCents: number | null;
  holdCents: number | null;
  cancelledCents: number | null;
  cdCents: number | null;
  issuedCount: number | null;
  satCount: number | null;
  soldCount: number | null;
};

/** A cohort observation at MARKET grain — the only grain rates come from. */
export type CohortObservation = Omit<CohortOfficeRow, "officeCode"> & {
  officeCount: number;
  isCurrent?: boolean;
};

/**
 * The cohort's figures, with every branch nullable for the reason above.
 *
 * `netSalesCents` comes from the DEFINITION (a subtraction).
 * `observedDispositionCents` comes from LP's REPORTED state (a sum).
 * `reconciliationDeltaCents` is how far apart they are. They are three separate
 * fields on purpose — collapsing any two of them is the mistake.
 */
export type CohortDecomposition = {
  grossCents: number | null;
  lostCents: number | null;
  pendingCents: number | null;
  maturedCents: number | null;
  netSalesCents: number | null;
  observedDispositionCents: number | null;
  reconciliationDeltaCents: number | null;
};

export type WaterfallDelta = { cents: number; pct: number };

export type WaterfallWarning = {
  level: "warning";
  deltaCents: number;
  deltaPct: number;
  message: string;
};

/**
 * ⚠️ TWO RATES, BOTH OVER GROSS WRITTEN, ANSWERING DIFFERENT QUESTIONS. They are
 * within a rounding point of each other on settled cohorts, which is precisely
 * why they must never share a name.
 *
 *   Historical Mature NSA Rate = Σ NSA ÷ Σ Gross Written  (eligible cohorts)
 *       "Of what we wrote, how much ultimately SETTLED to LP's net?"
 *       Backward-looking, needs cohorts old enough to have settled, and is the
 *       assumption behind the Expected Mature Net forecast.
 *
 *   Net Retention %            = Net Sales ÷ Gross Written  (any cohort)
 *       "Of what we wrote, how much has NOT been permanently lost?"
 *       Available immediately, on any cohort including the current month.
 *
 * On Jan–May 2026 both round to 71.1%. On July 2026 they are 50.9% and 76.3% —
 * a 25-point gap that is working and hold still in play. Reading one as the
 * other misreports a young month badly in whichever direction you got it wrong.
 */
export type HistoricalMatureNsaRate = {
  /** Fraction, e.g. 0.711. Not a percentage. */
  rate: number;
  cohortCount: number;
  grossCents: number;
  /** THE NUMERATOR: settled NSA, not Net Sales. The name says which. */
  nsaCents: number;
  eligibilityDays: number;
  /** The contract months that fed it, oldest first — for the tile's footnote. */
  months: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Null-safe arithmetic. All-or-unknown, deliberately.
// ─────────────────────────────────────────────────────────────────────────────

/** Sum, where a single unknown makes the whole total unknown. */
export function sumKnown(values: ReadonlyArray<number | null | undefined>): number | null {
  let total = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — aggregate to market grain BEFORE deriving anything
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fold office rows into one row per (contractMonth, market, observedOn).
 *
 * Fort Lauderdale is BOCA + FTLAU + MIAMI. On the 2026-08-11 snapshot those are
 * gross $94,415 / $140,433 / $0 and net $85,415 / $0 / $0. Reading the FTLAU
 * row alone reports the market at $140,433 gross and $0 net — the defect this
 * function exists to make structurally impossible. Requiring every call site to
 * remember to sum is how that bug recurs.
 *
 * RFED appears in January and not in August, so the constituent set is not
 * fixed and is never hardcoded — whatever offices the snapshot carries are the
 * offices that get summed.
 */
/**
 * The coverage date of a GROUP — the EARLIEST of its members, and null if any
 * member does not declare one.
 *
 * Deliberately the opposite of how `observedOn` folds. A rolled-up row is only
 * as current as its stalest constituent: if Fort Lauderdale reaches 08-09 while
 * everyone else reaches 08-10, the company row contains nine days of Fort
 * Lauderdale and ten of everything else, and claiming 08-10 for the total
 * overstates a market's worth of coverage. `cohorts.core` conceded this in prose
 * for `observedOn` and never acted on it; for a date that gates a goal-bearing
 * figure, the conservative answer is the only defensible one.
 *
 * All-or-unknown, matching `sumKnown`: one undeclared member makes the whole
 * group's coverage unknown rather than silently inheriting its siblings'.
 */
export function minCoverage(dates: readonly (string | null)[]): string | null {
  if (dates.length === 0) return null;
  let min: string | null = null;
  for (const d of dates) {
    if (d == null) return null;
    if (min == null || d < min) min = d;
  }
  return min;
}

export function rollupToMarket(rows: readonly CohortOfficeRow[]): CohortObservation[] {
  const byKey = new Map<string, CohortOfficeRow[]>();
  for (const r of rows) {
    const key = `${r.contractMonth}|${r.market}|${r.observedOn}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }

  const out: CohortObservation[] = [];
  for (const group of byKey.values()) {
    const first = group[0]!;
    out.push({
      contractMonth: first.contractMonth,
      market: first.market,
      observedOn: first.observedOn,
      dataThrough: minCoverage(group.map((r) => r.dataThrough)),
      officeCount: new Set(group.map((r) => r.officeCode ?? "")).size,
      grossCents: sumKnown(group.map((r) => r.grossCents)),
      nsaCents: sumKnown(group.map((r) => r.nsaCents)),
      workingCents: sumKnown(group.map((r) => r.workingCents)),
      holdCents: sumKnown(group.map((r) => r.holdCents)),
      cancelledCents: sumKnown(group.map((r) => r.cancelledCents)),
      cdCents: sumKnown(group.map((r) => r.cdCents)),
      issuedCount: sumKnown(group.map((r) => r.issuedCount)),
      satCount: sumKnown(group.map((r) => r.satCount)),
      soldCount: sumKnown(group.map((r) => r.soldCount)),
    });
  }
  return out.sort(
    (a, b) =>
      a.contractMonth.localeCompare(b.contractMonth) ||
      a.market.localeCompare(b.market) ||
      a.observedOn.localeCompare(b.observedOn),
  );
}

/**
 * Fold market rows into ONE row per contract month — the company view.
 *
 * The same rule as `rollupToMarket`, one level up: sum the dollars, then derive
 * the rate from the sums. Never average the markets' rates; on 2026-08-12 that
 * would weight Lakeland's $70,964 equally with Fort Myers' $873,208.
 *
 * ⚠️ Pass ONE observation per (month, market). The maturation view retains every
 * superseded snapshot on purpose, so folding an unfiltered read counts a cohort
 * once per time it was observed.
 */
export function foldCohortsByMonth(
  observations: readonly CohortObservation[],
  market = "REECE",
): CohortObservation[] {
  const byMonth = new Map<string, CohortObservation[]>();
  for (const o of observations) {
    const bucket = byMonth.get(o.contractMonth);
    if (bucket) bucket.push(o);
    else byMonth.set(o.contractMonth, [o]);
  }

  const out: CohortObservation[] = [];
  for (const [contractMonth, group] of byMonth) {
    out.push({
      contractMonth,
      market: group.length === 1 ? group[0]!.market : market,
      // The freshest OBSERVATION in the group. Correct for the maturation series
      // — "the latest time we looked at January" — and safe there because it
      // dates nothing that is paced.
      observedOn: group.reduce((max, o) => (o.observedOn > max ? o.observedOn : max), group[0]!.observedOn),
      // COVERAGE folds the other way: min, and unknown if any market is unknown.
      // See minCoverage — a company row is only as current as its stalest
      // market, and this is the date the hard gate judges.
      dataThrough: minCoverage(group.map((o) => o.dataThrough)),
      officeCount: group.reduce((n, o) => n + o.officeCount, 0),
      grossCents: sumKnown(group.map((o) => o.grossCents)),
      nsaCents: sumKnown(group.map((o) => o.nsaCents)),
      workingCents: sumKnown(group.map((o) => o.workingCents)),
      holdCents: sumKnown(group.map((o) => o.holdCents)),
      cancelledCents: sumKnown(group.map((o) => o.cancelledCents)),
      cdCents: sumKnown(group.map((o) => o.cdCents)),
      issuedCount: sumKnown(group.map((o) => o.issuedCount)),
      satCount: sumKnown(group.map((o) => o.satCount)),
      soldCount: sumKnown(group.map((o) => o.soldCount)),
      isCurrent: group.every((o) => o.isCurrent !== false),
    });
  }
  return out.sort((a, b) => a.contractMonth.localeCompare(b.contractMonth));
}

// ─────────────────────────────────────────────────────────────────────────────
// Cohort age and eligibility
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Whole days from the first of the contract month to `asOf`. */
export function cohortAgeDays(contractMonth: string, asOf: string): number {
  const start = Date.parse(`${contractMonth.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / MS_PER_DAY);
}

/**
 * Is this cohort old enough to feed the mature rate?
 *
 * The current month never is, whatever the arithmetic says — its Gross Written
 * is still accumulating, so it is not a fixed denominator yet.
 */
export function isEligibleForMatureRate(
  contractMonth: string,
  asOf: string,
  eligibilityDays: number = MATURE_RATE_ELIGIBILITY_DAYS,
): boolean {
  const age = cohortAgeDays(contractMonth, asOf);
  if (!Number.isFinite(age)) return false;
  return age >= eligibilityDays;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — the decomposition and its rates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Net Sales = Gross Written − Cancellations − Financing Denied.
 * The goal-bearing basis. By subtraction, which is authoritative.
 */
export function netSalesCents(o: Pick<CohortObservation, "grossCents" | "cancelledCents" | "cdCents">): number | null {
  const lost = sumKnown([o.cancelledCents, o.cdCents]);
  if (lost == null || o.grossCents == null) return null;
  return o.grossCents - lost;
}

/**
 * What LP currently reports the business as DOING: settled + still in play.
 *
 * This is an observation of the same cohort, not a second way to compute Net
 * Sales. Where it disagrees with the definition, `reconciliationDelta` is the
 * disagreement and both figures stand.
 */
export function observedDispositionCents(o: CohortObservation): number | null {
  return sumKnown([o.nsaCents, o.workingCents, o.holdCents]);
}

/**
 * observed disposition − Net Sales.
 *
 * POSITIVE means LP's dispositions account for MORE than the definition says
 * exists. Algebraically identical to `waterfallDelta` (which frames the same
 * quantity against LP's five-bucket identity); this is the framing that
 * matters to the cohort panels, because it names precisely the two figures a
 * reader can see side by side.
 */
export function reconciliationDelta(o: CohortObservation): number | null {
  const observed = observedDispositionCents(o);
  const defined = netSalesCents(o);
  if (observed == null || defined == null) return null;
  return observed - defined;
}

export function decompose(o: CohortObservation): CohortDecomposition {
  return {
    grossCents: o.grossCents,
    lostCents: sumKnown([o.cancelledCents, o.cdCents]),
    pendingCents: sumKnown([o.workingCents, o.holdCents]),
    maturedCents: o.nsaCents,
    // ALWAYS the subtraction. Never pendingCents + maturedCents, however
    // tempting it is to reuse the two fields directly above.
    netSalesCents: netSalesCents(o),
    observedDispositionCents: observedDispositionCents(o),
    reconciliationDeltaCents: reconciliationDelta(o),
  };
}

/** Ratio of sums, as a fraction. Null denominator or numerator ⇒ unmeasured. */
function fraction(numerator: number | null, denominator: number | null, what: string): Measured {
  if (numerator == null || denominator == null) {
    return unmeasured(`${what} not computable — the report did not carry every component`);
  }
  if (!(denominator > 0)) {
    return unmeasured(`${what} not computable — no gross written in the denominator`);
  }
  return measured(numerator / denominator);
}

/**
 * THE QUALITY KPI: how much of what we wrote survived all the way to LP's net.
 *
 * Stays nsa ÷ gross even when the waterfall does not foot. No normalising the
 * components to 100%, no allocating the residual, no silent "Other" bucket — a
 * source-quality issue must never start moving the metric it is measured
 * against.
 */
export function netSurvivalRate(o: CohortObservation): Measured {
  return fraction(o.nsaCents, o.grossCents, "net survival rate");
}

/**
 * NET RETENTION % — the goal-bearing basis as a share of what was written.
 * "Of what we wrote, how much has NOT been permanently lost?"
 *
 * NOT the Historical Mature NSA Rate. See the note on that type: on July 2026
 * this reads 76.3% and the NSA rate reads 50.9%.
 */
export function netRetentionRate(o: CohortObservation): Measured {
  return fraction(netSalesCents(o), o.grossCents, "net retention %");
}

/** working + hold, over gross. The share still genuinely undecided. */
export function pendingRate(o: CohortObservation): Measured {
  return fraction(sumKnown([o.workingCents, o.holdCents]), o.grossCents, "pending rate");
}

/** cancelled + credit decline, over gross. Terminal losses. */
export function lostRate(o: CohortObservation): Measured {
  return fraction(sumKnown([o.cancelledCents, o.cdCents]), o.grossCents, "lost rate");
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — waterfall reconciliation: a DIAGNOSTIC, never a gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * (nsa + working + hold + cancelled + cd) − gross.
 *
 * POSITIVE means the disposition buckets EXCEED Gross Written; negative means
 * they fall short. Fixed sign convention so engineering, alerts and diagnostics
 * all agree.
 *
 * Measured 2026-08-12 the identity ties exactly on only two of eight cohorts,
 * and the sign flips between April and June — so it is not a systematic
 * double-count, and nothing here tries to explain it away.
 *
 * Algebraically this is the same quantity as `reconciliationDelta`: expanding
 * (nsa+working+hold+cancelled+cd) − gross gives (nsa+working+hold) − (gross −
 * cancelled − cd), i.e. observed disposition − Net Sales. Two framings of one
 * miss — this one against LP's five-bucket identity, the other against the two
 * figures a reader sees side by side.
 */
export function waterfallDelta(o: CohortObservation): WaterfallDelta | null {
  const buckets = sumKnown([o.nsaCents, o.workingCents, o.holdCents, o.cancelledCents, o.cdCents]);
  if (buckets == null || o.grossCents == null || !(o.grossCents > 0)) return null;
  const cents = buckets - o.grossCents;
  return { cents, pct: cents / o.grossCents };
}

/**
 * A non-footing waterfall produces a WARNING and the observation is still used.
 *
 * The precedent is report 138's disposition identity: it was verified against
 * January alone, generalised into an ingestion invariant, and rejected 60 files
 * in a day before being downgraded to a warning. A reconciliation identity
 * OBSERVED in data is evidence; a source-system accounting identity is a
 * contract. LP guarantees no such contract, so this stays an observation.
 *
 * The dollar magnitude is carried alongside the percentage because 0.8% of a
 * $12M cohort is nearly $100K and may deserve investigation despite passing a
 * percentage-only rule.
 */
export function waterfallWarning(
  o: CohortObservation,
  threshold: number = WATERFALL_DELTA_THRESHOLD,
): WaterfallWarning | null {
  const d = waterfallDelta(o);
  if (d == null) return null;
  if (Math.abs(d.pct) <= threshold) return null;
  const dollars = Math.round(d.cents / 100);
  const sign = d.cents > 0 ? "exceed" : "fall short of";
  return {
    level: "warning",
    deltaCents: d.cents,
    deltaPct: d.pct,
    message:
      `${o.market} ${o.contractMonth}: disposition buckets ${sign} gross written by ` +
      `$${Math.abs(dollars).toLocaleString("en-US")} (${(d.pct * 100).toFixed(2)}%). ` +
      `Recorded, not corrected — the net survival rate is unaffected.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — the modeled mature rate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HISTORICAL MATURE NSA RATE — Σ NSA ÷ Σ Gross Written over ELIGIBLE cohorts.
 *
 * The numerator is SETTLED NSA, deliberately: this rate answers "what does a
 * dollar written eventually settle to", so its numerator has to be the settled
 * figure. Using Net Sales here would make it a retention rate wearing a
 * maturity rate's name — see the note on `HistoricalMatureNsaRate`.
 *
 * SUM THE NUMERATORS AND DENOMINATORS, THEN DIVIDE. Never average cohort rates:
 * an average weights a $2M month equally with a $13M one and answers a question
 * nobody asked.
 *
 * Takes one observation per cohort — pass the CURRENT observation of each, not
 * the whole history, or a cohort observed five times counts five times.
 */
export function historicalMatureNsaRate(
  observations: readonly CohortObservation[],
  asOf: string,
  eligibilityDays: number = MATURE_RATE_ELIGIBILITY_DAYS,
): Measured<HistoricalMatureNsaRate> {
  const eligible = observations.filter((o) =>
    isEligibleForMatureRate(o.contractMonth, asOf, eligibilityDays),
  );
  if (eligible.length === 0) {
    return unmeasured(
      `no cohort is at least ${eligibilityDays} days old as of ${asOf}, so there is ` +
        `no settled history to model from`,
    );
  }

  let gross = 0;
  let nsa = 0;
  const months = new Set<string>();
  for (const o of eligible) {
    // A cohort whose report did not carry NSA cannot join either sum —
    // including its gross while dropping its numerator would bias the rate
    // down and look like a quality collapse.
    if (o.nsaCents == null || o.grossCents == null) continue;
    gross += o.grossCents;
    nsa += o.nsaCents;
    months.add(o.contractMonth);
  }

  if (!(gross > 0)) {
    return unmeasured(
      `the ${eligible.length} eligible cohort observation(s) carry no usable gross ` +
        `written with a settled NSA beside it`,
    );
  }

  return measured({
    rate: nsa / gross,
    cohortCount: months.size,
    grossCents: gross,
    nsaCents: nsa,
    eligibilityDays,
    months: [...months].sort(),
  });
}

/**
 * What this period's writing is worth once it settles: Gross Written × the
 * HISTORICAL MATURE NSA RATE.
 *
 * NOT A QUALITY METRIC. This is Gross Written × a historical constant, so
 * within a month a manager raises it only by writing MORE, never by writing
 * BETTER. It is a forecast. No UI copy, tooltip or comment may imply otherwise
 * — the quality incentive lives in the net survival rate.
 *
 * The rate passed in must be the mature NSA rate, not Net Retention % — the
 * two are within a point on settled cohorts and 25 points apart on a young one.
 */
export function expectedMatureNet(grossToDateCents: number | null, rate: number): number | null {
  if (grossToDateCents == null || !Number.isFinite(grossToDateCents)) return null;
  if (!Number.isFinite(rate)) return null;
  return Math.round(grossToDateCents * rate);
}

/**
 * Does this market have enough volume to carry its own rate, or does it fall
 * back to the company's? The caller must mark a fallen-back cell.
 */
export function usesOwnRate(
  grossCents: number | null,
  minGross: number = MIN_GROSS_FOR_OWN_RATE_CENTS,
): boolean {
  return grossCents != null && grossCents >= minGross;
}
