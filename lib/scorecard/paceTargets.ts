/**
 * Pure NSLI goal-chain math — the ONE place per-day pace targets, per-day actuals,
 * and goal proration are computed. No DB imports; unit-tested in a plain node env.
 *
 * Locked chain (per office, per period):
 *   issues_needed = period_goal ÷ office NSLI
 *   leads_needed  = issues_needed ÷ office issue rate   (issued ÷ leads, from
 *                   historical actuals — a DERIVED data point, never entered;
 *                   ruled 2026-08-04. Distinct from % Issue = issued ÷ sets.)
 *   demos_needed  = issues_needed × target demo (sit) rate
 *   sales_needed  = period_goal ÷ office NET average sale
 *   *_per_day     = *_needed ÷ selling days in the period   (target side)
 *   actual_per_day = actual ÷ elapsed COMPLETED selling days (actual side)
 *
 * Company targets are ALWAYS the sum of the office targets (per-day values sum
 * exactly) — never company_goal ÷ blended NSLI. Additivity is a hard requirement.
 *
 * Every function is null-propagating: a missing rate or a zero denominator yields
 * null (rendered "—"), never NaN/Infinity.
 */

const round1 = (v: number): number => Math.round(v * 10) / 10;

export type TargetChainInput = {
  /** Full-period $ goal for this office (Σ of the months in range). */
  periodGoal: number;
  /** Trailing NSLI (net ÷ leads issued); null/0 → issued & demo targets null. */
  nsli: number | null;
  /** Trailing NET average sale (net ÷ sales); null/0 → closed target null. */
  avgSale: number | null;
  /** Target demo (sit) rate, 0–100. */
  targetDemoPct: number;
  /** Historical issue rate (issued ÷ leads, 0–1 fraction); null/0 → leads
   *  target null (rendered "—"), never NaN/Infinity. */
  issueRate: number | null;
};

export type TargetTotals = {
  leads: number | null;
  issued: number | null;
  demoed: number | null;
  closed: number | null;
};

export type PerDayTargets = {
  leadsPerDay: number | null;
  issuedPerDay: number | null;
  demoedPerDay: number | null;
  closedPerDay: number | null;
};

/** Full-period target counts for one office via the locked NSLI chain. */
export function targetTotals(i: TargetChainInput): TargetTotals {
  const issued = i.nsli != null && i.nsli > 0 ? i.periodGoal / i.nsli : null;
  const leads = issued != null && i.issueRate != null && i.issueRate > 0 ? issued / i.issueRate : null;
  const demoed = issued != null ? issued * (i.targetDemoPct / 100) : null;
  const closed = i.avgSale != null && i.avgSale > 0 ? i.periodGoal / i.avgSale : null;
  return { leads, issued, demoed, closed };
}

/** Total ÷ period selling days, rounded to 0.1. Null on missing total or 0 days. */
export function perDayTarget(total: number | null, periodDays: number): number | null {
  if (total == null || !Number.isFinite(total) || periodDays <= 0) return null;
  return round1(total / periodDays);
}

export function perDayTargets(t: TargetTotals, periodDays: number): PerDayTargets {
  return {
    leadsPerDay: perDayTarget(t.leads, periodDays),
    issuedPerDay: perDayTarget(t.issued, periodDays),
    demoedPerDay: perDayTarget(t.demoed, periodDays),
    closedPerDay: perDayTarget(t.closed, periodDays),
  };
}

/**
 * Company per-day targets = the EXACT sum of the office per-day targets (each
 * office already rounded to 0.1, then summed and re-rounded only to strip float
 * noise). Offices with a null value are skipped — the company figure is the sum
 * of the computable offices, never NaN. Returns null only when NO office has a
 * value.
 */
export function sumPerDayTargets(offices: PerDayTargets[]): PerDayTargets {
  const sumOf = (pick: (o: PerDayTargets) => number | null): number | null => {
    let sum = 0;
    let any = false;
    for (const o of offices) {
      const v = pick(o);
      if (v != null) {
        sum += v;
        any = true;
      }
    }
    return any ? round1(sum) : null;
  };
  return {
    leadsPerDay: sumOf((o) => o.leadsPerDay),
    issuedPerDay: sumOf((o) => o.issuedPerDay),
    demoedPerDay: sumOf((o) => o.demoedPerDay),
    closedPerDay: sumOf((o) => o.closedPerDay),
  };
}

/** Σ office totals (null-skipping; null only when all offices are null). */
export function sumTargetTotals(list: TargetTotals[]): TargetTotals {
  const sumOf = (pick: (t: TargetTotals) => number | null): number | null => {
    let sum = 0;
    let any = false;
    for (const t of list) {
      const v = pick(t);
      if (v != null) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };
  return {
    leads: sumOf((t) => t.leads),
    issued: sumOf((t) => t.issued),
    demoed: sumOf((t) => t.demoed),
    closed: sumOf((t) => t.closed),
  };
}

/**
 * Actual per-day pace = actual ÷ elapsed COMPLETED selling days. Today never
 * counts as elapsed (the caller's elapsed already excludes it). 0 elapsed days
 * (first of the month) → null, rendered "—" — never a division by zero.
 */
export function perDayActual(actual: number, elapsedDays: number): number | null {
  if (!Number.isFinite(actual) || elapsedDays <= 0) return null;
  return round1(actual / elapsedDays);
}

/**
 * THE goal-proration helper — goal $ scaled to the elapsed share of the period.
 * Replaces the four divergent inline copies that used to live in scorecard.ts,
 * byMarket.ts, and viewModel.ts. 0 period days → null (upstream data problem,
 * surfaced as "—"), 0 elapsed → 0 (a real "nothing expected yet").
 */
export function prorateGoal(
  goal: number | null,
  elapsedDays: number,
  periodDays: number,
): number | null {
  if (goal == null || !Number.isFinite(goal)) return null;
  if (periodDays <= 0) return null;
  const e = Math.max(0, elapsedDays);
  return goal * (e / periodDays);
}
