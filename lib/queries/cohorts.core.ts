/**
 * Sales cohorts: what an appointment month was worth, and what it turned into.
 *
 * Pure core — no DB imports, so it unit-tests in a plain node env. The wrapper
 * lives in `lib/queries/cohorts.ts` and re-exports everything here, so callers
 * have one import.
 *
 * ══ A COHORT IS THE MONTH THE APPOINTMENT FELL IN ══
 *
 * Report 137 filters on APPOINTMENT dates — verified from the PDF header, "For
 * Appointment Dates Between Sun 08/02/26 and Sat 08/08/26". The CSV carries only
 * SDate/EDate and never states its filter, which is how this field was called
 * `contract_month` for as long as it was.
 *
 * ⚠️ STANDING RULE: TWO EXPORTS SHARING `SDate`/`EDate` ARE NOT THEREBY ON THE
 * SAME DATE BASIS. Render as PDF — the header states filters the CSV omits.
 *
 * VALUE BASIS AND COHORT BASIS ARE DIFFERENT THINGS AND BOTH ARE TRUE. Gross
 * Written is the contract dollar amount of sales whose APPOINTMENTS fall in the
 * window. Not a contradiction, and not a blocker.
 *
 * ══ COHORT DATE FOLLOWS THE DEPARTMENT BEING MANAGED ══
 *
 * Sales is measured on the APPOINTMENT date: what did the appointments Sales
 * was responsible for produce? The call center is measured on the SET date:
 * what happened to the appointments this setter created? A setter who books on
 * Aug 5 for Aug 12 belongs to the week of Aug 5 on one scorecard and to the
 * period containing Aug 12 on the other. Same appointment, two valid views.
 *
 * Everything in this file is the APPOINTMENT-date cohort — the sales side. Never
 * mix the two bases inside one KPI.
 *
 * ══ THE COHORT IS IMMUTABLE ══
 *
 * A July cohort stays July business forever; only its DISPOSITION changes.
 * Nothing here may ever add a maturing prior-month dollar to a current month's
 * figure — that is the single rule that makes cohort reporting mean anything,
 * and it is why Gross Written is treated as the fixed denominator throughout.
 * Months are NOT kept closed: restatement is expected and is the whole point of
 * re-observing.
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
 * How old a cohort must be to feed the settled-rate denominator.
 *
 * ANCHORED AT THE APPOINTMENT MONTH START — a cohort is `days` old when that
 * many days have passed since the first of its appointment month. THE ANCHOR IS
 * PART OF THE RULE: measured this way on 2026-08-12, Jan–May qualify (5
 * cohorts, $58.2M, 71.10%) and June (72 days) does not. An end-of-month anchor
 * would select Jan–Apr and return 71.67% — a different published figure.
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
 * Below this much Gross Written, a market does not get its own settled rate —
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
  appointmentMonth: string; // 'YYYY-MM-01'
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
 * SETTLED NET RETENTION — Σ Net Sales ÷ Σ Gross Written over ELIGIBLE cohorts.
 *
 * "Of what we wrote in a month old enough to have settled, how much survived?"
 * Measured 2026-08-12 over the start-anchored 90-day window: Jan–May, 5
 * cohorts, $58,169,659 written, $41,357,719 net, **71.10%**.
 *
 * ⚠️ THE NUMERATOR IS NET SALES, NOT NSA, AND THE DIFFERENCE IS PUBLISHED.
 * Σ NSA ÷ Σ Gross over the same five cohorts is 71.06%. Both round to 71.1% at
 * one decimal place, which is exactly why this went unnoticed while the code
 * computed the NSA version — the contract publishes two decimals, and there
 * they differ. The two quantities also answer different questions:
 *
 *   Settled Net Retention = Net Sales ÷ Gross  — how much was NOT permanently
 *       lost. Working and Hold are unresolved business and stay IN it. This is
 *       the goal-bearing basis and the forecast multiplier.
 *
 *   Net Survival (NSA)    = Report 137 NSA ÷ Gross — how much LP has settled.
 *       Working and Hold are removed. A diagnostic, never a forecast input.
 *
 * On a SETTLED cohort the gap is small because little is still in play. On a
 * YOUNG one it is enormous: July 2026 reads 76.3% retention against 50.9%
 * survival, and the 25 points between them are working and hold, not loss.
 */
export type SettledNetRetention = {
  /** Fraction, e.g. 0.711. Not a percentage. */
  rate: number;
  cohortCount: number;
  grossCents: number;
  /** THE NUMERATOR: Net Sales (gross − cancelled − cd), not NSA. */
  netSalesCents: number;
  eligibilityDays: number;
  /** The appointment months that fed it, oldest first — for the tile's footnote. */
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
 * Fold office rows into one row per (appointmentMonth, market, observedOn).
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
    const key = `${r.appointmentMonth}|${r.market}|${r.observedOn}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }

  const out: CohortObservation[] = [];
  for (const group of byKey.values()) {
    const first = group[0]!;
    out.push({
      appointmentMonth: first.appointmentMonth,
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
      a.appointmentMonth.localeCompare(b.appointmentMonth) ||
      a.market.localeCompare(b.market) ||
      a.observedOn.localeCompare(b.observedOn),
  );
}

/**
 * Fold market rows into ONE row per appointment month — the company view.
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
    const bucket = byMonth.get(o.appointmentMonth);
    if (bucket) bucket.push(o);
    else byMonth.set(o.appointmentMonth, [o]);
  }

  const out: CohortObservation[] = [];
  for (const [appointmentMonth, group] of byMonth) {
    out.push({
      appointmentMonth,
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
  return out.sort((a, b) => a.appointmentMonth.localeCompare(b.appointmentMonth));
}

/**
 * ── §10 — A PERIOD IS ITS MONTHS, AND ITS COVERAGE IS THE NEWEST ONE ────────
 *
 * Every cohort whose appointment month falls in [periodStart, periodEnd],
 * summed. Cohort immutability is what makes this legal: each month's contracts
 * stay in their own month, so a window simply decides which months are in
 * scope — nothing migrates.
 *
 * ⚠️ THE DEFECT THIS REPLACES. The page selected a SINGLE cohort, the one whose
 * appointment month equalled `periodStart`, and rendered it as the period's
 * headline. For MTD that is correct and indistinguishable. For 3-Month it
 * showed one month of Net Sales against three months of goal; for YTD, January
 * against the year. The figure was not stale or approximate — it was a
 * different quantity wearing the period's label.
 *
 * ⚠️ COVERAGE IS MAX(dataThrough), NOT MIN. A closed month's coverage date marks
 * COMPLETENESS, not staleness: January reaching 01-31 says January is finished,
 * not that a Jan–Aug total stops there. Taking the min is what made the YTD view
 * report "through 2026-01-31 · 162 days behind" while every month was current.
 *
 * This is deliberately the OPPOSITE fold from `minCoverage`, which combines
 * MARKETS WITHIN one month and is conservative for a good reason — a company
 * row is only as current as its stalest market. Different axis, different rule.
 * Both are right; conflating them is what produced the banner.
 *
 * Whether the range is INCOMPLETE is a separate question, and not one this can
 * answer: a missing month is invisible to a sum of the months present. The
 * reporting clock owns it, because it knows the calendar.
 */
export function periodCohortTotals(
  cohorts: readonly CohortObservation[],
  periodStart: string,
  periodEnd: string,
): {
  grossCents: number | null;
  netSalesCents: number | null;
  /** MAX over the months in range — see above. Null if none declared one. */
  dataThrough: string | null;
  /** Which appointment months fed it, oldest first. */
  months: string[];
} {
  const inPeriod = cohorts.filter(
    (c) => c.appointmentMonth >= periodStart && c.appointmentMonth <= periodEnd,
  );
  return {
    grossCents: sumKnown(inPeriod.map((c) => c.grossCents)),
    netSalesCents: sumKnown(inPeriod.map((c) => netSalesCents(c))),
    dataThrough: inPeriod.reduce<string | null>(
      (max, c) => (c.dataThrough != null && (max == null || c.dataThrough > max) ? c.dataThrough : max),
      null,
    ),
    months: [...new Set(inPeriod.map((c) => c.appointmentMonth))].sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cohort age and eligibility
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Whole days from the first of the appointment month to `asOf`. */
export function cohortAgeDays(appointmentMonth: string, asOf: string): number {
  const start = Date.parse(`${appointmentMonth.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / MS_PER_DAY);
}

/**
 * Is this cohort old enough to feed the settled rate?
 *
 * The current month never is, whatever the arithmetic says — its Gross Written
 * is still accumulating, so it is not a fixed denominator yet.
 */
export function isEligibleForMatureRate(
  appointmentMonth: string,
  asOf: string,
  eligibilityDays: number = MATURE_RATE_ELIGIBILITY_DAYS,
): boolean {
  const age = cohortAgeDays(appointmentMonth, asOf);
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
 * NOT Settled Net Retention (the modeled rate) and NOT Net Survival. On July 2026
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

/**
 * PERMANENT LOSS % — cancellations + financing denied, over Gross Written.
 *
 * Identical arithmetic to `lostRate`, published under the name §3 and §16 use.
 * The name earns its keep: "lost" invites a reader to assume Working and Hold
 * belong in it, since those are also colloquially "not won yet". They do not.
 * Only the two TERMINAL outcomes are here. A $30,000 job on permit hold is
 * still good business.
 */
export function permanentLossRate(o: CohortObservation): Measured {
  return fraction(sumKnown([o.cancelledCents, o.cdCents]), o.grossCents, "permanent loss %");
}

// ─────────────────────────────────────────────────────────────────────────────
// Amendment A2 — the appointment counts ARE the sales funnel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Demo % — Sat ÷ Issued, both from Report 137, both on the appointment cohort.
 *
 * ⚠️ THIS IS THE SALES SCORECARD'S "Demo %", NOT "Company Demo %". The latter
 * belongs to the call-center scorecard, is computed on a SET-date cohort from a
 * different source, and is a different number: on 8/2–8/8 this reads 60.8%
 * (271 ÷ 446) while Appointment Statistics reads 62.2% (260 ÷ 418). Two valid
 * views of one week. Giving them one name is the collision Amendment A exists
 * to prevent.
 *
 * Under v4 §1 these counts were barred from funnel metrics. Amendment A2
 * retires that bar: 137 filters on appointment dates, so its counts and its
 * dollars describe ONE cohort, and pairing them is the point. The bar was
 * correct only while a single funnel was being made to serve both departments.
 */
export function demoRate(o: CohortObservation): Measured {
  return fraction(o.satCount, o.issuedCount, "demo %");
}

/**
 * Demo → Sale % — Sold ÷ Sat, both from Report 137.
 *
 * NEVER "Close %". Close % is `sales ÷ issued appointments` and is a different
 * denominator on numbers people plan against — see lib/scorecard/labels.ts.
 */
export function demoToSaleRate(o: CohortObservation): Measured {
  return fraction(o.soldCount, o.satCount, "demo → sale %");
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
      `${o.market} ${o.appointmentMonth}: disposition buckets ${sign} gross written by ` +
      `$${Math.abs(dollars).toLocaleString("en-US")} (${(d.pct * 100).toFixed(2)}%). ` +
      `Recorded, not corrected — the net survival rate is unaffected.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 — the modeled settled rate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SETTLED NET RETENTION — Σ Net Sales ÷ Σ Gross Written over ELIGIBLE cohorts.
 *
 * SUM THE NUMERATORS AND DENOMINATORS, THEN DIVIDE. Never average cohort rates:
 * an average weights a $2M month equally with a $13M one and answers a question
 * nobody asked.
 *
 * ELIGIBILITY IS START-ANCHORED, AND THE ANCHOR IS PART OF THE RULE. A cohort
 * is `eligibilityDays` old when that many days have passed since the FIRST of
 * its appointment month. On 2026-08-12 that selects Jan–May — 5 cohorts,
 * $58,169,659 written, 71.10%. An end-of-month anchor would select Jan–Apr — 4
 * cohorts, $45,248,267, 71.67%. A different answer, which is why the anchor is
 * specified rather than left to whoever reads the code next.
 *
 * 90 days is an INCLUSION THRESHOLD, not a claim that a cohort is settled on
 * day 90. It is provisional until the maturation series is long enough to show
 * where the rate actually stabilises.
 *
 * Takes one observation per cohort — pass the CURRENT observation of each, not
 * the whole history, or a cohort observed five times counts five times. That is
 * also why the tile states its sample in COHORTS and DOLLARS: repeated
 * observations of one cohort are not independent samples, so "n=17" would be a
 * lie about the evidence even when the arithmetic is right.
 */
export function settledNetRetention(
  observations: readonly CohortObservation[],
  asOf: string,
  eligibilityDays: number = MATURE_RATE_ELIGIBILITY_DAYS,
): Measured<SettledNetRetention> {
  const eligible = observations.filter((o) =>
    isEligibleForMatureRate(o.appointmentMonth, asOf, eligibilityDays),
  );
  if (eligible.length === 0) {
    return unmeasured(
      `no cohort is at least ${eligibilityDays} days old as of ${asOf}, so there is ` +
        `no settled history to model from`,
    );
  }

  let gross = 0;
  let net = 0;
  const months = new Set<string>();
  for (const o of eligible) {
    // A cohort whose report did not carry every component of Net Sales cannot
    // join either sum — including its gross while dropping its numerator would
    // bias the rate down and look like a quality collapse.
    const n = netSalesCents(o);
    if (n == null || o.grossCents == null) continue;
    gross += o.grossCents;
    net += n;
    months.add(o.appointmentMonth);
  }

  if (!(gross > 0)) {
    return unmeasured(
      `the ${eligible.length} eligible cohort observation(s) carry no usable gross ` +
        `written with a complete Net Sales beside it`,
    );
  }

  return measured({
    rate: net / gross,
    cohortCount: months.size,
    grossCents: gross,
    netSalesCents: net,
    eligibilityDays,
    months: [...months].sort(),
  });
}

/**
 * What this period's writing is worth once it settles: Gross Written × the
 * SETTLED NET RETENTION rate.
 *
 * NOT A QUALITY METRIC. This is Gross Written × a historical constant, so
 * within a month a manager raises it only by writing MORE, never by writing
 * BETTER. It is a forecast. No UI copy, tooltip or comment may imply otherwise
 * — the quality incentive lives in Net Retention % on the cohort itself.
 *
 * ⚠️ MATURATION INVERTS UNDER THIS DEFINITION. Losses accrue over time, so a
 * young cohort reads TOO GOOD, not too bad: July 76.3% and August 84.8% against
 * a settled ~71%. August is currently overstated by roughly $300K and WILL
 * FALL. Anything rendering this forecast has to say so, or a reader will treat
 * a young month's retention as an improvement.
 */
export function expectedSettledNet(grossToDateCents: number | null, rate: number): number | null {
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
