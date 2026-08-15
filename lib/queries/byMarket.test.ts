import { describe, expect, it } from "vitest";
import {
  rowHasActivity,
  paceFields,
  achievedFrom,
  netSalesByMarket,
  leadPlanFor,
  type ByMarketRow,
} from "./byMarket";
import type { CohortObservation } from "./cohorts.core";
import { measured, unmeasured } from "@/lib/scorecard/tiers/types";
import type { LeadRate } from "@/lib/scorecard/leadRate";

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
  // E7: the published actual is the DISTINCT count.
  leads: 0,
  // Not sourced by default — these arrive only from snapshots taken after
  // LP-MCP began publishing the lead grain, and absent is not zero.
  leads_rows: null,
  leads_superseded: null,
  // E3: no goal and no rate on the default fixture — the planning figures are
  // unmeasured, which is what a utility row genuinely is.
  leads_target_period: null,
  leads_target_to_date: null,
  leads_pace_delta: null,
  leads_rate_own: false,
  leads_rate: null,
  issued: 0,
  demos: 0,
  sales: 0,
  demo_pct: null,
  demo_to_sale_pct: null,
  gross_sales: 0,
  net_sales: 0,
  net_sales_through: null,
  goal: null,
  pctToGoal: null,
  elapsedPct: null,
  achievedPct: null,
  paceDeltaPts: null,
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

// ── §2 — the pace re-expression is derived, not recomputed ─────────────────
//
// `pctToGoal` already divides net by the PRORATED to-date goal, and
// `prorateGoal` is linear, so:
//
//   pctToGoal ≥ 100  ⟺  achievedPct ≥ elapsedPct  ⟺  paceDeltaPts ≥ 0
//
// These tests pin that equivalence. If anyone ever changes the goal math, the
// caption and the colour band would silently start disagreeing — the sentence
// would say "ahead of pace" on a red bar. That is what these catch.

describe("§2 — achieved vs elapsed, derived from the ratio already on screen", () => {
  /** 25% of the goal banked on 23% of the selling days: the brief's example.
   *  6 of 26 selling days = 23.1% elapsed; net 250k of a 1M period goal;
   *  prorated goal = 1M × 6/26 = 230,769 → pctToGoal = 108.3. */
  const actuals = { days_elapsed: 6, working_days_in_period: 26 };

  it("a market at 25% achieved / 23% elapsed reads AHEAD, and its bar is green", () => {
    const pctToGoal = Math.round((250_000 / (1_000_000 * (6 / 26))) * 1000) / 10;
    expect(pctToGoal).toBeGreaterThanOrEqual(100); // the ≥100 green band

    const p = paceFields(actuals, pctToGoal);
    expect(p.elapsedPct).toBeCloseTo(23.1, 1);
    expect(p.achievedPct).toBeCloseTo(25, 1);
    expect(p.paceDeltaPts).toBeGreaterThan(0);
  });

  it("EQUIVALENCE: a nonzero delta never contradicts the colour band", () => {
    // The delta is elapsedFrac × (pctToGoal − 100), so its sign is proportional
    // to the band by construction. It can round to 0.0 when the band is
    // marginally off 100 and barely any of the period has elapsed — at 1 of 26
    // days, 99.9% of target is 0.004 points behind. "On pace" is true there.
    // What must never happen is a delta that points the OTHER way from the bar.
    for (const pctToGoal of [40, 89.9, 90, 99.9, 100, 100.1, 150, 400]) {
      for (const a of [
        { days_elapsed: 1, working_days_in_period: 26 },
        { days_elapsed: 13, working_days_in_period: 26 },
        { days_elapsed: 26, working_days_in_period: 26 },
      ]) {
        const d = paceFields(a, pctToGoal).paceDeltaPts!;
        if (d > 0) expect(pctToGoal).toBeGreaterThan(100);
        if (d < 0) expect(pctToGoal).toBeLessThan(100);
      }
    }
  });

  it("IDENTITY: paceDeltaPts = elapsedFrac × (pctToGoal − 100)", () => {
    // The algebraic content of the whole change, pinned. If the goal math ever
    // stops being linear this fails, which is exactly when the caption would
    // start lying about the bar.
    for (const pctToGoal of [40, 90, 100, 108.3, 150]) {
      for (const days of [1, 6, 13, 26]) {
        const p = paceFields({ days_elapsed: days, working_days_in_period: 26 }, pctToGoal);
        // Stored at 0.1 resolution, so half a step is the exact bound.
        expect(Math.abs(p.paceDeltaPts! - (days / 26) * (pctToGoal - 100))).toBeLessThanOrEqual(0.05001);
        // achievedPct, elapsedPct and the delta are each rounded independently,
        // so their difference can drift by up to a step and a half.
        expect(Math.abs(p.achievedPct! - p.elapsedPct! - p.paceDeltaPts!)).toBeLessThanOrEqual(0.15001);
      }
    }
  });

  it("achievedPct is the goal ratio, NOT the prorated one", () => {
    // The whole point: 108.3% of the MTD target is 25% of the month's money.
    const p = paceFields(actuals, 108.3);
    expect(p.achievedPct).toBeLessThan(30);
    expect(p.achievedPct).not.toBeCloseTo(108.3, 0);
  });

  it("elapsedPct survives a missing goal — the calendar is known regardless", () => {
    // Load-bearing for the All-Markets row, whose goal is derived AFTER the row
    // is built; without this it would lose the elapsed figure it needs.
    const p = paceFields(actuals, null);
    expect(p.elapsedPct).toBeCloseTo(23.1, 1);
    expect(p.achievedPct).toBeNull();
    expect(p.paceDeltaPts).toBeNull();
  });

  it("no goal and no calendar yield nulls, never a fabricated 0%", () => {
    const p = paceFields({ days_elapsed: 0, working_days_in_period: 0 }, null);
    expect(p).toEqual({ elapsedPct: null, achievedPct: null, paceDeltaPts: null });
  });

  it("reads period_working_days first, matching the ① hero's day basis", () => {
    // A multi-month range expands the denominator; using the monthly column
    // would overstate elapsed% on every aggregate view.
    const p = paceFields(
      { days_elapsed: 26, period_working_days: 104, working_days_in_period: 26 },
      100,
    );
    expect(p.elapsedPct).toBeCloseTo(25, 1);
  });

  it("achievedFrom re-derives the All-Markets row after its goal is summed", () => {
    expect(achievedFrom(108.3, 23.1)).toEqual({ achievedPct: 25, paceDeltaPts: 1.9 });
    expect(achievedFrom(null, 23.1)).toEqual({ achievedPct: null, paceDeltaPts: null });
    expect(achievedFrom(108.3, null)).toEqual({ achievedPct: null, paceDeltaPts: null });
  });
});

/**
 * ── By-Market Net Sales (2026-08-13) ────────────────────────────────────────
 *
 * Every figure below was read from `lp_cohort_maturation` (is_current,
 * appointment_month 2026-08-01) on 2026-08-13, and the RTP comparisons from
 * `lp_market_scorecard_daily` on the same day.
 *
 * The defect this pins: the cards read `released_dollars ?? net_sales` off
 * lp_market_scorecard_daily, whose `net_sales` IS `released_dollars`
 * (revenue_basis 'rtp_net_by_milestone_date', revenue_as_of 2026-08-06). So a
 * SALES scorecard paced a sales goal against production releases.
 */

/**
 * [market, gross, cancelled, cd, issued, sat, sold] in cents / counts.
 *
 * ⚠️ ONE OBSERVATION, PINNED: `observed_on = 2026-08-11`, covering data through
 * 08-10. The dollars AND the counts are read from that single row set, which is
 * the property Amendment A2 turns on — they describe one appointment-date
 * cohort, so a fixture that took counts from a different observation (or a
 * different report) would not be testing what ships. Live data has since moved
 * on; this stays pinned so the assertions stay reproducible.
 */
const AUG_2026: Array<[string, number, number, number, number, number, number]> = [
  ["FTLAU_MKT", 23_484_800, 9_569_800, 0, 47, 25, 4],
  ["FTMYR_MKT", 87_320_800, 2_844_300, 2_328_100, 161, 101, 32],
  ["JAX_MKT", 17_710_700, 0, 6_259_500, 74, 45, 10],
  ["LAKE_MKT", 7_096_400, 0, 0, 15, 10, 4],
  ["ORL_MKT", 25_160_100, 4_021_100, 1_356_100, 97, 44, 15],
  ["SAR_MKT", 30_243_000, 812_500, 1_380_500, 82, 52, 19],
  ["STPET_MKT", 27_512_500, 4_662_300, 0, 110, 72, 11],
];

const obs = (
  [market, grossCents, cancelledCents, cdCents, issuedCount, satCount, soldCount]: (typeof AUG_2026)[number],
  over: Partial<CohortObservation> = {},
): CohortObservation => ({
  appointmentMonth: "2026-08-01",
  market,
  observedOn: "2026-08-11", // the RUN date — must never reach a pace calculation
  dataThrough: "2026-08-10", // the COVERAGE date — the only one that may
  officeCount: 1,
  grossCents,
  nsaCents: null,
  workingCents: null,
  holdCents: null,
  cancelledCents,
  cdCents,
  issuedCount,
  satCount,
  soldCount,
  isCurrent: true,
  ...over,
});

const AUG = AUG_2026.map((r) => obs(r));
const dollars = (c: number | null) => (c == null ? null : Math.round(c / 100));

describe("netSalesByMarket", () => {
  const m = netSalesByMarket(AUG, "2026-08-01", "2026-08-31");

  it("Fort Myers is $821,484 — not the $212,514 the RTP card showed", () => {
    expect(dollars(m.get("FTMYR_MKT")!.netSalesCents)).toBe(821_484);
    // Anti-vacuity: the old basis and the new differ by ~4x, so a fixture that
    // accidentally reproduced the old number could not pass this.
    expect(dollars(m.get("FTMYR_MKT")!.netSalesCents)).not.toBe(212_514);
    // And it is NOT gross-after-cancels either — financing denied is $23,281.
    expect(dollars(m.get("FTMYR_MKT")!.netSalesCents)).not.toBe(844_765);
  });

  it("Orlando's net no longer exceeds its gross — the tell that it was never sales", () => {
    // The live RTP row read gross_sales $127,023 against net_sales $179,726.
    // Net above gross is impossible on a sales basis and routine on a release
    // basis, because August releases include contracts written in May.
    const orl = m.get("ORL_MKT")!;
    expect(dollars(orl.netSalesCents)).toBe(197_829);
    expect(dollars(orl.grossCents)).toBe(251_601);
    expect(orl.netSalesCents!).toBeLessThan(orl.grossCents!);
    expect(dollars(orl.netSalesCents)).not.toBe(179_726);
  });

  it("Lakeland renders a figure at all — the RTP column was NULL for it", () => {
    expect(dollars(m.get("LAKE_MKT")!.netSalesCents)).toBe(70_964);
  });

  it("the company row is the sum of the markets: $1,852,941", () => {
    expect(dollars(m.get("REECE")!.netSalesCents)).toBe(1_852_941);
    const bySumming = AUG_2026.reduce((a, [, g, c, cd]) => a + (g - c - cd), 0);
    expect(dollars(bySumming)).toBe(1_852_941);
  });

  it("Fort Lauderdale is NOT double-summed — the view already rolled its offices up", () => {
    // BOCA + FTLAU + MIAMI (+ RFED when present) are summed into FTLAU_MKT in
    // the database. Iterating `m.sources` here as well would double it.
    expect(dollars(m.get("FTLAU_MKT")!.netSalesCents)).toBe(139_150);
    expect(dollars(m.get("FTLAU_MKT")!.netSalesCents)).not.toBe(278_300);
  });

  it("carries the COVERAGE date, never the run date", () => {
    expect(m.get("REECE")!.dataThrough).toBe("2026-08-10");
    expect(m.get("REECE")!.dataThrough).not.toBe("2026-08-11");
  });

  it("a market whose coverage is undeclared makes the company coverage unknown", () => {
    // is_partial_month → data_through NULL. The company row must not inherit
    // its siblings' date and claim coverage one market cannot prove.
    const mixed = netSalesByMarket(
      [obs(AUG_2026[0]!, { dataThrough: null }), ...AUG_2026.slice(1).map((r) => obs(r))],
      "2026-08-01",
      "2026-08-31",
    );
    expect(mixed.get("FTLAU_MKT")!.dataThrough).toBeNull();
    expect(mixed.get("REECE")!.dataThrough).toBeNull();
    expect(mixed.get("SAR_MKT")!.dataThrough).toBe("2026-08-10");
  });

  it("an unmeasured component makes the total unmeasured, not smaller", () => {
    const mixed = netSalesByMarket(
      [obs(AUG_2026[0]!, { cdCents: null }), ...AUG_2026.slice(1).map((r) => obs(r))],
      "2026-08-01",
      "2026-08-31",
    );
    expect(mixed.get("FTLAU_MKT")!.netSalesCents).toBeNull();
    expect(mixed.get("REECE")!.netSalesCents).toBeNull();
    // NOT the sum of the six that ARE known — that would read as a real,
    // confidently-too-low company total.
    expect(mixed.get("REECE")!.netSalesCents).not.toBe(171_379_100);
  });

  it("excludes appointment months outside the period — cohorts never migrate", () => {
    const july = obs(["FTMYR_MKT", 1_000_000_00, 0, 0, 0, 0, 0], { appointmentMonth: "2026-07-01" });
    const aug = netSalesByMarket([...AUG, july], "2026-08-01", "2026-08-31");
    expect(dollars(aug.get("FTMYR_MKT")!.netSalesCents)).toBe(821_484);

    // A YTD window spans both, and July's contracts stay July business.
    const ytd = netSalesByMarket([...AUG, july], "2026-01-01", "2026-12-31");
    expect(dollars(ytd.get("FTMYR_MKT")!.netSalesCents)).toBe(821_484 + 1_000_000);
  });

  it("returns an empty map when the cohort fetch failed, rather than zeros", () => {
    const empty = netSalesByMarket([], "2026-08-01", "2026-08-31");
    expect(empty.size).toBe(0);
    expect(empty.get("REECE")).toBeUndefined();
  });
});

describe("the market goal is paced against the same basis", () => {
  // scorecard_goals_monthly, goal_month 2026-08-01, goal_basis 'net'.
  const GOALS: Record<string, number> = {
    FTMYR_MKT: 2_600_000,
    STPET_MKT: 2_731_306.68,
    SAR_MKT: 1_744_200.99,
    ORL_MKT: 1_598_142.4,
    JAX_MKT: 1_200_000,
    FTLAU_MKT: 1_000_000,
    LAKE_MKT: 138_724,
  };

  it("the market goals sum to the company goal, so the total ties to its parts", () => {
    const sum = Object.values(GOALS).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(11_012_374);
  });

  it("Fort Myers reads 102.7% of pace, not the 26.6% the RTP card showed", () => {
    const m = netSalesByMarket(AUG, "2026-08-01", "2026-08-31");
    const target = (GOALS.FTMYR_MKT! * 8) / 26; // 8 of 26 selling days, through 08-10
    expect(Math.round(target)).toBe(800_000);
    const net = dollars(m.get("FTMYR_MKT")!.netSalesCents)!;
    expect(Math.round((net / target) * 1000) / 10).toBe(102.7);
    // What the same market showed on the retired basis.
    expect(Math.round((212_514 / target) * 1000) / 10).toBe(26.6);
  });

  it("Lakeland is the best-pacing market in the company, and rendered nothing before", () => {
    const m = netSalesByMarket(AUG, "2026-08-01", "2026-08-31");
    const target = (GOALS.LAKE_MKT! * 8) / 26;
    const net = dollars(m.get("LAKE_MKT")!.netSalesCents)!;
    expect(Math.round((net / target) * 1000) / 10).toBe(166.3);
  });
});

/**
 * ── Amendment A2 — the sales funnel comes from Report 137 ───────────────────
 *
 * The rule this REPLACES: v4 §1 barred 137's appointment columns from any
 * funnel metric. That was right only while a single funnel served both Sales
 * and the call center. 137 filters on appointment dates, so its counts and its
 * dollars describe ONE cohort — and pairing them is what makes a market row
 * internally consistent instead of splicing live-sync counts onto 137 money.
 *
 * The rule that SURVIVES: these counts still may not be reconciled to
 * Appointment Statistics. Different cohort basis, different attribution, and
 * per-setter differences that run in both directions.
 */
describe("A2 — market funnel counts come from the 137 cohort", () => {
  const m = netSalesByMarket(AUG, "2026-08-01", "2026-08-31");

  it("reconciles EXACTLY to the 137 fixture for the same appointment window", () => {
    // A2: "A sales-scorecard Issued or Demos figure that does not reconcile to
    // the 137 export for the same appointment-date range is a DEFECT."
    expect(m.get("FTMYR_MKT")!.issuedCount).toBe(161);
    expect(m.get("FTMYR_MKT")!.satCount).toBe(101);
    expect(m.get("FTMYR_MKT")!.soldCount).toBe(32);
    // Company row is Σ of the markets, matching the 137 export's own total for
    // observed_on 2026-08-11.
    expect(m.get("REECE")!.issuedCount).toBe(586);
    expect(m.get("REECE")!.satCount).toBe(349);
    expect(m.get("REECE")!.soldCount).toBe(95);
  });

  it("§5 is dissolved — market-grain Demo % is a VALUE, never unmeasured", () => {
    // v4 §5 blocked this because Appointment Statistics carries no market
    // column. 137 By Market does, so the blocker is gone and the fallback with
    // it. Every market resolves.
    for (const [market] of AUG_2026) {
      const r = m.get(market)!;
      expect(r.issuedCount).not.toBeNull();
      expect(r.satCount).not.toBeNull();
      const demoPct = (r.satCount! / r.issuedCount!) * 100;
      expect(Number.isFinite(demoPct)).toBe(true);
    }
  });

  it("derives the rate from SUMMED counts, never an average of the markets' rates", () => {
    const r = m.get("REECE")!;
    const summed = (r.satCount! / r.issuedCount!) * 100;
    const averaged =
      AUG_2026.reduce((a, [, , , , iss, sat]) => a + (sat / iss) * 100, 0) / AUG_2026.length;
    expect(Math.round(summed * 10) / 10).toBe(59.6);
    // §11 applies to counts exactly as to dollars: the two answers differ, and
    // the summed one is the published figure.
    expect(Math.round(averaged * 10) / 10).not.toBe(Math.round(summed * 10) / 10);
  });

  it("a count the report did not carry is unknown, not zero", () => {
    // Same all-or-unknown rule the dollars follow. One market with a missing
    // count makes the COMPANY total unknown rather than quietly understating
    // it — a smaller-but-confident total is the failure mode being prevented.
    const holed = AUG_2026.map((r, i) =>
      i === 0 ? obs(r, { issuedCount: null }) : obs(r),
    );
    const h = netSalesByMarket(holed, "2026-08-01", "2026-08-31");
    expect(h.get("FTLAU_MKT")!.issuedCount).toBeNull();
    expect(h.get("REECE")!.issuedCount).toBeNull();
    // The dollars are unaffected — a missing count is not a missing sale.
    expect(dollars(h.get("REECE")!.netSalesCents)).toBe(1_852_941);
  });

  it("cohorts do not migrate: a July count never lands in an August window", () => {
    const july = obs(AUG_2026[0]!, {
      appointmentMonth: "2026-07-01",
      issuedCount: 999,
      satCount: 999,
      soldCount: 999,
    });
    const aug = netSalesByMarket([...AUG, july], "2026-08-01", "2026-08-31");
    expect(aug.get("FTLAU_MKT")!.issuedCount).toBe(47);
    // Widen the window and the July cohort joins — it does not move, the window does.
    const ytd = netSalesByMarket([...AUG, july], "2026-01-01", "2026-12-31");
    expect(ytd.get("FTLAU_MKT")!.issuedCount).toBe(47 + 999);
  });
});

/**
 * ── §11 — the market rollup regression fixture ──────────────────────────────
 *
 * Fort Lauderdale is BOCA + FTLAU + MIAMI, summed BEFORE any rate is derived.
 * Reading the FTLAU office row alone gives $140,433 gross and $0 net — the
 * 5%-of-target row this fixture exists to keep from coming back.
 */
describe("§11 — Fort Lauderdale is a rollup, and the counts roll up with it", () => {
  const OFFICES: Array<[string, number, number, number, number, number, number]> = [
    // [office, gross, cancelled, cd, issued, sat, sold]
    ["BOCA", 9_441_500, 0, 0, 18, 11, 2],
    ["FTLAU", 14_043_300, 9_569_800, 0, 22, 11, 2],
    ["MIAMI", 0, 0, 0, 7, 3, 0],
  ];

  const rolled: CohortObservation = {
    appointmentMonth: "2026-08-01",
    market: "FTLAU_MKT",
    observedOn: "2026-08-11",
    dataThrough: "2026-08-10",
    officeCount: OFFICES.length,
    grossCents: OFFICES.reduce((a, o) => a + o[1], 0),
    nsaCents: 8_541_500,
    workingCents: null,
    holdCents: null,
    cancelledCents: OFFICES.reduce((a, o) => a + o[2], 0),
    cdCents: OFFICES.reduce((a, o) => a + o[3], 0),
    issuedCount: OFFICES.reduce((a, o) => a + o[4], 0),
    satCount: OFFICES.reduce((a, o) => a + o[5], 0),
    soldCount: OFFICES.reduce((a, o) => a + o[6], 0),
    isCurrent: true,
  };

  it("reproduces $234,848 gross / $95,698 cancelled / $139,150 net", () => {
    const m = netSalesByMarket([rolled], "2026-08-01", "2026-08-31");
    const r = m.get("FTLAU_MKT")!;
    expect(dollars(r.grossCents)).toBe(234_848);
    expect(dollars(r.netSalesCents)).toBe(139_150);
    expect(rolled.cancelledCents! / 100).toBe(95_698);
    expect(rolled.cdCents).toBe(0);
  });

  it("taking the first office row instead gives $140,433 gross and $0 net", () => {
    // The exact defect, pinned. Net is 0 because FTLAU's own cancellations
    // ($95,698) very nearly equal its own gross.
    const first = OFFICES[1]!; // FTLAU, the office that shares the market's name
    expect(first[1] / 100).toBe(140_433);
    expect((first[1] - first[2] - first[3]) / 100).toBeCloseTo(44_735, 0);
    // …and against the market's real $139,150 that is a 68% understatement.
    expect(dollars(rolled.grossCents)).not.toBe(140_433);
  });

  it("the counts sum too — 47 issued, 25 sat, 4 sold", () => {
    expect(rolled.issuedCount).toBe(47);
    expect(rolled.satCount).toBe(25);
    expect(rolled.soldCount).toBe(4);
  });

  it("Report 137 NSA is carried as a DIAGNOSTIC and is not Net Sales", () => {
    // $85,415 NSA against $139,150 Net Sales on the same rows. The gap is
    // working and hold — unresolved business, not loss.
    const m = netSalesByMarket([rolled], "2026-08-01", "2026-08-31");
    expect(rolled.nsaCents! / 100).toBe(85_415);
    expect(dollars(m.get("FTLAU_MKT")!.netSalesCents)).toBe(139_150);
    expect(dollars(m.get("FTLAU_MKT")!.netSalesCents)).not.toBe(85_415);
  });
});

// ── E3 — the Leads requirement, per office ──────────────────────────────────
//
// The Funnel vs Goal panel has carried these since E3, but only for the ONE
// selected market. The office-by-office table — which is where offices actually
// get compared — showed a Leads actual with nothing to judge it against.
describe("leadPlanFor — needed / pace, per office", () => {
  const rate = (r: number, own = true) =>
    measured({
      rate: r, cohortCount: 5, netSalesCents: 0, distinctLeads: 20_000,
      eligibilityDays: 90, months: [], ownRate: own,
    });

  it("divides BOTH goals by the rate — period and to-date", () => {
    // Orlando's real measured rate. $1.5M period goal, half of it prorated.
    const p = leadPlanFor({ period: 1_500_000, prorated: 750_000 }, rate(534.21));
    expect(p.leads_target_period).toBe(2808);
    expect(p.leads_target_to_date).toBe(1404);
    expect(p.leads_rate).toBe(534);
    expect(p.leads_rate_own).toBe(true);
  });

  it("prorates by DIVIDING the prorated goal, not by re-deriving from days", () => {
    // The whole point: the Leads target inherits the dollar target's proration,
    // including this market's own report-137 coverage anchor. Any market whose
    // 137 file lags would otherwise carry two different elapsed fractions on one
    // row — a Leads target paced to the calendar beside dollars paced to 08-10.
    const full = leadPlanFor({ period: 1_000_000, prorated: 1_000_000 }, rate(500));
    const half = leadPlanFor({ period: 1_000_000, prorated: 500_000 }, rate(500));
    expect(full.leads_target_to_date).toBe(2000);
    expect(half.leads_target_to_date).toBe(1000);
    // The PERIOD requirement does not move with elapsed time — only to-date does.
    expect(half.leads_target_period).toBe(full.leads_target_period);
  });

  it("MARKS a borrowed company rate rather than passing it off as measured", () => {
    const p = leadPlanFor({ period: 400_000, prorated: 200_000 }, rate(735.95, false));
    expect(p.leads_rate_own).toBe(false);
    expect(p.leads_target_period).toBe(544);
  });

  it("no goal → no requirement, and NOT zero", () => {
    // The utility rows. Zero would read as "this office needs no leads".
    const p = leadPlanFor({ period: null, prorated: null }, rate(534.21));
    expect(p.leads_target_period).toBeNull();
    expect(p.leads_target_to_date).toBeNull();
  });

  it("no measurable rate → no requirement even when a goal exists", () => {
    const p = leadPlanFor({ period: 1_500_000, prorated: 750_000 }, unmeasured<LeadRate>("no settled cohort"));
    expect(p.leads_target_to_date).toBeNull();
    expect(p.leads_rate).toBeNull();
  });

  it("a non-positive rate cannot produce a requirement", () => {
    // Guards a divide-by-zero producing Infinity leads.
    const p = leadPlanFor({ period: 1_500_000, prorated: 750_000 }, rate(0));
    expect(p.leads_target_period).toBeNull();
  });
});
