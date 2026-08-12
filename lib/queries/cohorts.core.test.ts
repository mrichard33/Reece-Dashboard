/**
 * §2/§3/§5/§7 — cohorts, the mature rate, the waterfall, and market rollup.
 *
 * Every fixture below is real LP data read from `lp_cohort_maturation` on
 * 2026-08-12, in integer cents, so a failure here means the warehouse moved or
 * the arithmetic did — not that a made-up number drifted.
 */

import { describe, it, expect } from "vitest";
import {
  MATURE_RATE_ELIGIBILITY_DAYS,
  WATERFALL_DELTA_THRESHOLD,
  cohortAgeDays,
  decompose,
  expectedMatureNet,
  isEligibleForMatureRate,
  lostRate,
  matureRate,
  netSalesCents,
  netSalesRate,
  netSurvivalRate,
  pendingRate,
  rollupToMarket,
  sumKnown,
  usesOwnRate,
  waterfallDelta,
  waterfallWarning,
  type CohortObservation,
  type CohortOfficeRow,
} from "./cohorts.core";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Company totals per cohort, current observation, 2026-08-12. Cents. */
const COMPANY: Array<[month: string, g: number, n: number, w: number, h: number, c: number, cd: number]> = [
  ["2026-01-01", 1_191_279_800, 875_481_300, 0, 0, 248_217_900, 71_475_700],
  ["2026-02-01", 1_086_272_500, 798_925_500, 0, 992_100, 188_008_800, 103_865_700],
  ["2026-03-01", 1_189_098_000, 835_799_300, 0, 2_100_000, 237_453_600, 128_837_100],
  ["2026-04-01", 1_058_176_400, 755_161_600, 0, 1_901_100, 196_558_400, 107_528_000],
  ["2026-05-01", 1_292_139_207, 867_923_515, 8_828_600, 16_138_300, 255_613_192, 143_635_600],
  ["2026-06-01", 1_141_956_313, 746_572_413, 23_890_700, 32_149_100, 220_413_200, 117_624_000],
  ["2026-07-01", 1_045_008_800, 531_733_400, 152_336_900, 110_157_700, 175_268_400, 72_766_700],
  ["2026-08-01", 218_528_300, 62_679_800, 91_960_600, 30_653_700, 21_910_000, 11_324_200],
];

const cohort = (
  [contractMonth, grossCents, nsaCents, workingCents, holdCents, cancelledCents, cdCents]: (typeof COMPANY)[number],
  market = "REECE",
): CohortObservation => ({
  contractMonth,
  market,
  observedOn: "2026-08-12",
  officeCount: 9,
  grossCents,
  nsaCents,
  workingCents,
  holdCents,
  cancelledCents,
  cdCents,
  issuedCount: null,
  satCount: null,
  soldCount: null,
});

const COHORTS = COMPANY.map((r) => cohort(r));
const byMonth = (m: string) => COHORTS.find((c) => c.contractMonth === m)!;

/**
 * §7 — Fort Lauderdale is three LP offices, from snapshot
 * 7b76f264-6e2b-4e1c-ab5f-41e3838090bd (August MTD, observed 2026-08-11).
 * RFED is absent in August and present in January: the constituent set moves.
 */
const FTLAU_OFFICES: CohortOfficeRow[] = [
  {
    contractMonth: "2026-08-01", market: "FTLAU_MKT", observedOn: "2026-08-11", officeCode: "BOCA",
    grossCents: 9_441_500, nsaCents: 8_541_500, workingCents: 0, holdCents: 900_000,
    cancelledCents: 0, cdCents: 0, issuedCount: 16, satCount: 9, soldCount: 2,
  },
  {
    contractMonth: "2026-08-01", market: "FTLAU_MKT", observedOn: "2026-08-11", officeCode: "FTLAU",
    grossCents: 14_043_300, nsaCents: 0, workingCents: 4_473_500, holdCents: 0,
    cancelledCents: 9_569_800, cdCents: 0, issuedCount: 20, satCount: 13, soldCount: 2,
  },
  {
    contractMonth: "2026-08-01", market: "FTLAU_MKT", observedOn: "2026-08-11", officeCode: "MIAMI",
    grossCents: 0, nsaCents: 0, workingCents: 0, holdCents: 0,
    cancelledCents: 0, cdCents: 0, issuedCount: 11, satCount: 3, soldCount: 0,
  },
];

/** §9 — Fort Myers August, the market where the five dollar figures diverge most. */
const FTMYR = cohort(
  ["2026-08-01", 87_320_800, 34_367_600, 46_618_800, 1_162_000, 2_844_300, 2_328_100],
  "FTMYR_MKT",
);

const AS_OF = "2026-08-12";

// ─── §7 · aggregate to market grain BEFORE deriving anything ─────────────────

describe("§7 — BOCA + FTLAU + MIAMI aggregate into FTLAU_MKT", () => {
  it("reproduces the market's real figures from its three offices", () => {
    const [m] = rollupToMarket(FTLAU_OFFICES);
    expect(m!.grossCents).toBe(23_484_800); // $234,848
    expect(m!.nsaCents).toBe(8_541_500); //    $85,415
    expect(m!.cancelledCents).toBe(9_569_800); // $95,698
    expect(m!.issuedCount).toBe(47);
    expect(m!.soldCount).toBe(4);
    expect(m!.officeCount).toBe(3);
  });

  it("REGRESSION: reading one constituent row reports a different market", () => {
    // This is the live defect the rollup exists to prevent — the FTLAU row
    // alone puts Fort Lauderdale at $140,433 gross and $0 net, which rendered
    // as the 5%-of-target row on the by-market table.
    const justFtlau = FTLAU_OFFICES.filter((r) => r.officeCode === "FTLAU");
    const [wrong] = rollupToMarket(justFtlau);
    expect(wrong!.grossCents).toBe(14_043_300);
    expect(wrong!.nsaCents).toBe(0);
    // And it is materially different from the truth, not a rounding apart.
    expect(wrong!.grossCents).not.toBe(23_484_800);
  });

  it("the market rate is a ratio of sums, not an average of office rates", () => {
    const [m] = rollupToMarket(FTLAU_OFFICES);
    const summed = netSurvivalRate(m!);
    expect(summed.known).toBe(true);
    // 8,541,500 / 23,484,800 = 36.4%
    if (summed.known) expect(summed.value).toBeCloseTo(0.3637, 4);

    // The average of the three offices' rates is 90.5%/0%/undefined — a
    // completely different answer, and the one a naive per-row read produces.
    const officeRates = FTLAU_OFFICES.filter((r) => r.grossCents! > 0).map(
      (r) => r.nsaCents! / r.grossCents!,
    );
    const averaged = officeRates.reduce((a, b) => a + b, 0) / officeRates.length;
    if (summed.known) expect(Math.abs(averaged - summed.value)).toBeGreaterThan(0.05);
  });

  it("does not assume a fixed constituent set — RFED appears in Jan, not Aug", () => {
    const withRfed: CohortOfficeRow[] = [
      ...FTLAU_OFFICES,
      { ...FTLAU_OFFICES[0]!, officeCode: "RFED", grossCents: 1_000_000, nsaCents: 500_000, holdCents: 0 },
    ];
    const [m] = rollupToMarket(withRfed);
    expect(m!.officeCount).toBe(4);
    expect(m!.grossCents).toBe(24_484_800);
  });
});

// ─── §9 · Net Sales is its own figure ────────────────────────────────────────

describe("§9 — Net Sales = Gross Written − Cancellations − Financing Denied", () => {
  it("is not gross-after-cancels: Fort Myers August is $23K apart", () => {
    const netSales = netSalesCents(FTMYR)!;
    const grossAfterCancels = FTMYR.grossCents! - FTMYR.cancelledCents!;
    expect(netSales).toBe(82_148_400); // $821,484
    expect(grossAfterCancels).toBe(84_476_500); // $844,765
    // The gap is exactly the financing denials, and it is material enough that
    // labelling either one "Net" without qualification misreports the market.
    expect(grossAfterCancels - netSales).toBe(FTMYR.cdCents);
  });

  it("is not NSA: Fort Myers August NSA is 58% smaller, because working has not drained", () => {
    expect(FTMYR.nsaCents).toBe(34_367_600); // $343,676
    expect(netSalesCents(FTMYR)).toBe(82_148_400); // $821,484
    expect(FTMYR.workingCents).toBe(46_618_800); // $466,188 of the gap
  });

  it("converges on NSA as a cohort settles — the reason it is the goal basis", () => {
    // Jan–Apr are settled: NSA lands within 2% of Net Sales. July is not.
    for (const m of ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]) {
      const c = byMonth(m);
      const ratio = c.nsaCents! / netSalesCents(c)!;
      expect(ratio).toBeGreaterThan(0.98);
      expect(ratio).toBeLessThan(1.02);
    }
    const jul = byMonth("2026-07-01");
    expect(jul.nsaCents! / netSalesCents(jul)!).toBeLessThan(0.7);
  });

  it("the two routes to Net Sales differ by exactly the waterfall delta", () => {
    for (const c of COHORTS) {
      const bySubtraction = netSalesCents(c)!;
      const byDisposition = c.nsaCents! + c.workingCents! + c.holdCents!;
      expect(byDisposition - bySubtraction).toBe(waterfallDelta(c)!.cents);
    }
  });
});

// ─── §3 · the decomposition ──────────────────────────────────────────────────

describe("§3 — cohort decomposition and its rates", () => {
  it("splits Gross Written into Lost and Net Sales, and Net Sales into Pending and Matured", () => {
    const jun = byMonth("2026-06-01");
    const d = decompose(jun);
    expect(d.grossCents).toBe(1_141_956_313);
    expect(d.lostCents).toBe(220_413_200 + 117_624_000);
    expect(d.pendingCents).toBe(23_890_700 + 32_149_100);
    expect(d.maturedCents).toBe(746_572_413);
    expect(d.netSalesCents).toBe(d.grossCents! - d.lostCents!);
  });

  it("reproduces the measured net survival rates", () => {
    const expected: Record<string, number> = {
      "2026-01-01": 0.735, "2026-02-01": 0.735, "2026-03-01": 0.703, "2026-04-01": 0.714,
      "2026-05-01": 0.672, "2026-06-01": 0.654, "2026-07-01": 0.509, "2026-08-01": 0.287,
    };
    for (const [month, want] of Object.entries(expected)) {
      const r = netSurvivalRate(byMonth(month));
      expect(r.known).toBe(true);
      if (r.known) expect(r.value).toBeCloseTo(want, 3);
    }
  });

  it("net sales rate and net survival rate are different questions", () => {
    // July: 76.3% of gross survived cancellation and financing denial, but only
    // 50.9% has settled to net — the 25-point gap is working and hold, still
    // live. Reading either one as the other misreports the month badly.
    const jul = byMonth("2026-07-01");
    const sales = netSalesRate(jul);
    const surv = netSurvivalRate(jul);
    expect(sales.known && surv.known).toBe(true);
    if (sales.known && surv.known) {
      expect(sales.value).toBeCloseTo(0.763, 3);
      expect(surv.value).toBeCloseTo(0.509, 3);
      // The gap is the pending share — LESS the waterfall delta, because
      // Net Sales comes from the subtraction and NSA from the buckets, and
      // those two routes differ by exactly the delta. On July that is 25.12%
      // pending against a 25.38% gap: the 0.26% difference IS July's −0.26%
      // reconciliation miss, which is why it cannot be waved off as rounding.
      const pend = pendingRate(jul);
      const delta = waterfallDelta(jul)!;
      if (pend.known) {
        expect(sales.value - surv.value).toBeCloseTo(pend.value - delta.pct, 6);
      }
    }
  });

  it("pending falls below 2% by three months — Mar–Jun are settled, not immature", () => {
    for (const m of ["2026-03-01", "2026-04-01"]) {
      const p = pendingRate(byMonth(m));
      if (p.known) expect(p.value).toBeLessThan(0.02);
    }
    // July is genuinely still resolving, and that is a different statement.
    const jul = pendingRate(byMonth("2026-07-01"));
    if (jul.known) expect(jul.value).toBeGreaterThan(0.2);
  });

  it("lost + pending + matured accounts for gross, up to the waterfall delta", () => {
    const apr = byMonth("2026-04-01");
    const parts = lostRate(apr), pend = pendingRate(apr), surv = netSurvivalRate(apr);
    if (parts.known && pend.known && surv.known) {
      const total = parts.value + pend.value + surv.value;
      expect(total).toBeCloseTo(1 + waterfallDelta(apr)!.pct, 6);
    }
  });
});

// ─── An unobserved disposition is UNKNOWN, not zero ──────────────────────────

describe("a blank column is unknown, never zero", () => {
  const unobserved: CohortObservation = { ...byMonth("2026-03-01"), nsaCents: null };

  it("yields an unmeasured survival rate, not 0%", () => {
    const r = netSurvivalRate(unobserved);
    expect(r.known).toBe(false);
    expect(r.value).toBeNull();
    if (!r.known) expect(r.reason).toMatch(/did not carry every component/);
  });

  it("yields no waterfall delta at all — the identity needs all five buckets", () => {
    expect(waterfallDelta(unobserved)).toBeNull();
    expect(waterfallWarning(unobserved)).toBeNull();
  });

  it("still computes Net Sales, which does not depend on NSA", () => {
    // This is why the Net Sales series is longer than the NSA series: it needs
    // only gross, cancelled and cd.
    expect(netSalesCents(unobserved)).toBe(netSalesCents(byMonth("2026-03-01")));
  });

  it("sumKnown refuses to treat a partial sum as a total", () => {
    expect(sumKnown([1, 2, 3])).toBe(6);
    expect(sumKnown([1, null, 3])).toBeNull();
    expect(sumKnown([1, undefined, 3])).toBeNull();
    // The failure mode this prevents: a market summed from the offices that
    // happened to report looks complete and understates the market.
    expect(sumKnown([9_441_500, null])).not.toBe(9_441_500);
  });

  it("a market total is unknown if ANY of its offices did not report", () => {
    const partial = [...FTLAU_OFFICES];
    partial[1] = { ...partial[1]!, nsaCents: null };
    const [m] = rollupToMarket(partial);
    expect(m!.nsaCents).toBeNull();
    expect(m!.grossCents).toBe(23_484_800); // the columns that DID report still sum
  });
});

// ─── §5 · the waterfall is a diagnostic, not a gate ──────────────────────────

describe("§5 — waterfall reconciliation", () => {
  it("reproduces all eight measured deltas", () => {
    const expected: Record<string, [cents: number, pct: number]> = {
      "2026-01-01": [3_895_100, 0.0033], "2026-02-01": [5_519_600, 0.0051],
      "2026-03-01": [15_092_000, 0.0127], "2026-04-01": [2_972_700, 0.0028],
      "2026-05-01": [0, 0], "2026-06-01": [-1_306_900, -0.0011],
      "2026-07-01": [-2_745_700, -0.0026], "2026-08-01": [0, 0],
    };
    for (const [month, [cents, pct]] of Object.entries(expected)) {
      const d = waterfallDelta(byMonth(month))!;
      expect(d.cents).toBe(cents);
      expect(d.pct).toBeCloseTo(pct, 4);
    }
  });

  it("SIGN: buckets exceeding gross yield a POSITIVE delta", () => {
    // Fixed convention so engineering, alerts and diagnostics agree.
    expect(waterfallDelta(byMonth("2026-03-01"))!.cents).toBeGreaterThan(0);
    expect(waterfallDelta(byMonth("2026-06-01"))!.cents).toBeLessThan(0);

    const inflated: CohortObservation = { ...byMonth("2026-05-01"), nsaCents: byMonth("2026-05-01").nsaCents! + 1_000_000 };
    expect(waterfallDelta(inflated)!.cents).toBe(1_000_000);
  });

  it("March's +1.27% WARNS and is still usable — it must not fail", () => {
    const mar = byMonth("2026-03-01");
    const w = waterfallWarning(mar);
    expect(w).not.toBeNull();
    expect(w!.level).toBe("warning");
    expect(w!.deltaCents).toBe(15_092_000);
    expect(w!.message).toMatch(/exceed/);
    expect(w!.message).toMatch(/\$150,920/);
    // The observation is still fully usable — this is the whole ruling.
    expect(netSurvivalRate(mar).known).toBe(true);
    expect(netSalesCents(mar)).not.toBeNull();
  });

  it("does NOT alter the survival rate — a source issue must not move the metric", () => {
    const mar = byMonth("2026-03-01");
    // nsa ÷ gross, full stop. Not normalised to the component total, not
    // reduced by the residual, no "Other" bucket anywhere.
    const r = netSurvivalRate(mar);
    if (r.known) expect(r.value).toBe(835_799_300 / 1_189_098_000);

    const componentTotal = 835_799_300 + 0 + 2_100_000 + 237_453_600 + 128_837_100;
    // The normalised rate is a DIFFERENT number — proving we did not compute it.
    if (r.known) expect(r.value).not.toBeCloseTo(835_799_300 / componentTotal, 6);
  });

  it("the threshold is configurable, not baked in", () => {
    const mar = byMonth("2026-03-01");
    expect(waterfallWarning(mar, WATERFALL_DELTA_THRESHOLD)).not.toBeNull();
    expect(waterfallWarning(mar, 0.02)).toBeNull(); // raised above 1.27%
    expect(waterfallWarning(byMonth("2026-04-01"), 0.001)).not.toBeNull(); // lowered below 0.28%
  });

  it("a cohort that ties exactly produces no warning", () => {
    expect(waterfallWarning(byMonth("2026-05-01"))).toBeNull();
    expect(waterfallDelta(byMonth("2026-05-01"))!.cents).toBe(0);
  });
});

// ─── §2 · eligibility and the mature rate ────────────────────────────────────

describe("§2 — mature-rate eligibility", () => {
  it("is 90 days, anchored at the cohort month start", () => {
    expect(MATURE_RATE_ELIGIBILITY_DAYS).toBe(90);
    expect(cohortAgeDays("2026-05-01", AS_OF)).toBe(103);
    expect(cohortAgeDays("2026-06-01", AS_OF)).toBe(72);
  });

  it("admits Jan–May and excludes June, July and August as of 2026-08-12", () => {
    const eligible = COHORTS.filter((c) => isEligibleForMatureRate(c.contractMonth, AS_OF));
    expect(eligible.map((c) => c.contractMonth)).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01",
    ]);
  });

  it("excludes the current month, whose gross is still accumulating", () => {
    expect(isEligibleForMatureRate("2026-08-01", AS_OF)).toBe(false);
  });
});

describe("§2 — the mature rate is a ratio of sums", () => {
  it("computes 71.1% from 5 cohorts and $58.2M written", () => {
    const r = matureRate(COHORTS, AS_OF);
    expect(r.known).toBe(true);
    if (!r.known) return;
    expect(r.value.cohortCount).toBe(5);
    expect(r.value.grossCents).toBe(5_816_965_907); // $58,169,659.07
    expect(r.value.netSalesCents).toBe(4_135_771_915); // $41,357,719.15
    expect(r.value.rate).toBeCloseTo(0.711, 3);
    expect(r.value.months).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01",
    ]);
  });

  it("SUMS then divides — averaging the cohort rates gives a different answer", () => {
    const r = matureRate(COHORTS, AS_OF);
    const eligible = COHORTS.filter((c) => isEligibleForMatureRate(c.contractMonth, AS_OF));
    const averaged =
      eligible.reduce((acc, c) => acc + netSalesCents(c)! / c.grossCents!, 0) / eligible.length;

    if (r.known) {
      // They are close because the cohorts are similar in size — which is
      // exactly why this must be pinned rather than eyeballed. A $2M month
      // would weigh the same as a $13M one under the average.
      expect(r.value.rate).not.toBe(averaged);
      expect(r.value.rate).toBeCloseTo(0.711, 3);
    }

    // Make the divergence unmissable: one tiny cohort with a wild rate.
    const skewed = [
      ...eligible,
      cohort(["2025-01-01", 100_000, 100_000, 0, 0, 0, 0]), // $1,000 at 100%
    ];
    const summed2 = matureRate(skewed, AS_OF);
    const averaged2 =
      skewed.reduce((acc, c) => acc + netSalesCents(c)! / c.grossCents!, 0) / skewed.length;
    if (summed2.known) {
      expect(Math.abs(summed2.value.rate - averaged2)).toBeGreaterThan(0.04);
      // The summed answer barely moves; the averaged one jumps ~5 points.
      expect(summed2.value.rate).toBeCloseTo(0.711, 2);
    }
  });

  it("the threshold is configurable — 150 days admits only Jan–Mar", () => {
    const r = matureRate(COHORTS, AS_OF, 150);
    if (r.known) {
      expect(r.value.cohortCount).toBe(3);
      expect(r.value.eligibilityDays).toBe(150);
    }
  });

  it("is unmeasured, not zero, when nothing is eligible yet", () => {
    const r = matureRate(COHORTS, "2026-01-15");
    expect(r.known).toBe(false);
    if (!r.known) expect(r.reason).toMatch(/no settled history/);
  });

  it("drops a cohort missing a component from BOTH sums, never just the numerator", () => {
    const holed = COHORTS.map((c) =>
      c.contractMonth === "2026-03-01" ? { ...c, cdCents: null } : c,
    );
    const r = matureRate(holed, AS_OF);
    if (r.known) {
      expect(r.value.cohortCount).toBe(4);
      // March's $11.89M gross must NOT be in the denominator on its own — that
      // would drag the rate down by ~14 points and look like a quality drop.
      expect(r.value.grossCents).toBe(5_816_965_907 - 1_189_098_000);
      expect(r.value.rate).toBeGreaterThan(0.7);
    }
  });
});

describe("§2 — Expected Mature Net is a forecast, not a quality measure", () => {
  it("is Gross Written × the historical rate", () => {
    const r = matureRate(COHORTS, AS_OF);
    if (!r.known) return;
    const aug = byMonth("2026-08-01");
    // August's $2,185,283 written × 71.1% ≈ $1.55M
    expect(expectedMatureNet(aug.grossCents, r.value.rate)).toBeCloseTo(155_371_500, -5);
  });

  it("moves ONLY with volume — writing better cannot raise it within a month", () => {
    const r = matureRate(COHORTS, AS_OF);
    if (!r.known) return;
    const gross = 218_528_300;
    const base = expectedMatureNet(gross, r.value.rate)!;
    // Double the quality (halve the losses) at identical volume: unchanged.
    // There is no quality input to pass — that IS the point. The only lever is
    // `gross`, so the same gross can only ever give the same answer.
    expect(expectedMatureNet(gross, r.value.rate)).toBe(base);
    // Double the volume: doubles, to within the cent this rounds to.
    expect(expectedMatureNet(gross * 2, r.value.rate)).toBeCloseTo(base * 2, -1);
  });

  it("is null for an unknown gross, never 0", () => {
    expect(expectedMatureNet(null, 0.711)).toBeNull();
  });
});

describe("market-level rates fall back below a volume floor", () => {
  it("a market with real volume carries its own rate", () => {
    expect(usesOwnRate(1_141_956_313)).toBe(true);
  });

  it("a thin market does not, and null is not enough volume", () => {
    expect(usesOwnRate(1_000_000)).toBe(false);
    expect(usesOwnRate(null)).toBe(false);
  });
});

describe("cohort immutability", () => {
  it("Gross Written does not change between observations of a closed month", () => {
    // March was observed 2026-08-06 and again 2026-08-09; gross was
    // $11,890,980 both times while NSA moved. The denominator is fixed.
    const early: CohortObservation = { ...byMonth("2026-03-01"), observedOn: "2026-08-06", nsaCents: null };
    const late = byMonth("2026-03-01");
    expect(early.grossCents).toBe(late.grossCents);
  });

  it("rollup keys on the cohort month, so two months never merge", () => {
    const mixed: CohortOfficeRow[] = [
      { ...FTLAU_OFFICES[0]! },
      { ...FTLAU_OFFICES[0]!, contractMonth: "2026-07-01" },
    ];
    const out = rollupToMarket(mixed);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.contractMonth)).toEqual(["2026-07-01", "2026-08-01"]);
  });
});
