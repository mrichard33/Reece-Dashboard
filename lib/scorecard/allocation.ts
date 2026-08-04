/**
 * Pure top-down goal-distribution math (ruled 2026-08-04): Mark sets ONE
 * company-wide goal; the system splits it across the 6 display markets by each
 * market's share of trailing Net Sales.
 *
 * EXACT-SUM REQUIREMENT: naive percentage math does not sum to the company
 * goal after rounding. Allocation is largest-remainder in INTEGER CENTS —
 * floor every share, then hand the leftover cents one at a time to the
 * largest fractional remainders (deterministic tie-break: larger weight, then
 * code order). Σ allocations === company goal is ASSERTED, not hoped for — a
 * violation throws and nothing writes.
 *
 * No DB imports; unit-tested in a plain node env.
 */

export type ShareWeight = {
  /** Display-market code (e.g. ORL_MKT). */
  code: string;
  /** Basis weight — trailing net $ (units cancel; only proportions matter).
   *  Negative weights are treated as 0 (a refund-heavy month can't produce a
   *  negative goal). */
  weight: number;
};

export type Allocation = {
  code: string;
  /** This market's share of the total weight (0–1; 0 for zero-weight markets). */
  share: number;
  /** Allocated goal in integer cents. */
  cents: number;
};

export class AllocationError extends Error {}

/**
 * Largest-remainder allocation. Zero-weight markets get share 0 / cents 0
 * (never a division by zero) — the CALLER flags them in the preview rather
 * than dropping them. All weights zero → AllocationError (there is no basis
 * to split on; the caller surfaces it).
 */
export function largestRemainder(companyCents: number, weights: ShareWeight[]): Allocation[] {
  if (!Number.isInteger(companyCents) || companyCents < 0) {
    throw new AllocationError(`company goal must be a non-negative integer cent amount, got ${companyCents}`);
  }
  if (weights.length === 0) throw new AllocationError("no markets to allocate to");
  const clamped = weights.map((w) => ({ code: w.code, weight: Math.max(0, w.weight) }));
  const total = clamped.reduce((a, w) => a + w.weight, 0);
  if (total <= 0) {
    throw new AllocationError("every market has zero trailing history — nothing to base a split on");
  }

  const raw = clamped.map((w) => {
    const share = w.weight / total;
    const exact = companyCents * share;
    return { code: w.code, weight: w.weight, share, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });

  let leftover = companyCents - raw.reduce((a, r) => a + r.floor, 0);
  // Deterministic order: largest fractional remainder → larger weight → code.
  const order = [...raw].sort(
    (a, b) => b.frac - a.frac || b.weight - a.weight || (a.code < b.code ? -1 : 1),
  );
  const extra = new Map<string, number>();
  for (const r of order) {
    if (leftover <= 0) break;
    extra.set(r.code, 1);
    leftover -= 1;
  }

  const out = raw.map((r) => ({ code: r.code, share: r.share, cents: r.floor + (extra.get(r.code) ?? 0) }));
  const sum = out.reduce((a, r) => a + r.cents, 0);
  if (sum !== companyCents) {
    // The hard invariant — Σ office goals must equal the company goal EXACTLY.
    throw new AllocationError(`allocation sum ${sum} != company goal ${companyCents}`);
  }
  return out;
}

/**
 * The EXPLICIT "redistribute remainder across untouched offices" action —
 * never triggered automatically. `locked` are the hand-overridden offices
 * (their cents are authoritative and untouched); the remainder
 * (companyCents − Σ locked) is re-split across the remaining weights.
 */
export function redistributeRemainder(
  companyCents: number,
  locked: { code: string; cents: number }[],
  weights: ShareWeight[],
): Allocation[] {
  const lockedCodes = new Set(locked.map((l) => l.code));
  const lockedSum = locked.reduce((a, l) => a + l.cents, 0);
  const remainder = companyCents - lockedSum;
  if (remainder < 0) {
    throw new AllocationError(
      `overridden offices (${lockedSum}¢) already exceed the distributed target (${companyCents}¢) — nothing to redistribute`,
    );
  }
  const open = weights.filter((w) => !lockedCodes.has(w.code));
  if (open.length === 0) throw new AllocationError("every office is overridden — nothing to redistribute across");
  return largestRemainder(remainder, open);
}
