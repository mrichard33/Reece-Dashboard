/**
 * TIER 5 — Backlog.  Basis: point in time, as of the snapshot's own date.
 * Source: `job_status_ytd`.
 *
 * This is a STOCK, not a flow. It is everything sitting open right now, and it
 * therefore IGNORES the period filter entirely — asking "how much backlog did
 * we have in August" is a category error, because backlog is not accumulated
 * over a window, it simply is. It honors the market filter and carries an
 * explicit as-of stamp so nobody reads it as a period figure.
 *
 * FOOTING: the buckets must sum to every open job the report knows about
 * (pending + released/production-track). If they do not, a status has appeared
 * upstream that this map does not classify, and the tier says so loudly rather
 * than quietly dropping the jobs.
 *
 * `Hold - Permit` SHIPS AS ITS OWN BUCKET. It is a live LP status carrying 18
 * jobs / $343,564 year to date. An earlier ruling folded it away, but that
 * ruling rested on a report that the status did not exist — it does. Splitting
 * now and collapsing later is a one-line map change; shipping it collapsed and
 * splitting later is a migration. Flagged for Mark's confirmation either way.
 */
import { measured, unmeasured, type Measured, type TierMeta } from "./types";
import { dollarsOf, forMarket, sumMetric, type RolledFact } from "./factRollup";

export type BacklogBucket = {
  key: "hoa" | "permit" | "other_pending";
  label: string;
  note: string;
  count: Measured;
  dollars: Measured;
};

export type Tier5 = {
  meta: TierMeta;
  asOf: string | null;
  buckets: BacklogBucket[];
  pendingCount: Measured;
  pendingDollars: Measured;
  /** Released / production-track open jobs — outside pending backlog. */
  excludedCount: Measured;
  excludedDollars: Measured;
  /** pending + excluded — every open job. Terminal outcomes are NOT in here. */
  openJobsTotal: Measured;
  /** Paid In Full / PIF Survey Ready. Terminal — never pending backlog. */
  completedCount: Measured;
  completedDollars: Measured;
  /** Cancelled / Cancelled By Mgt / Credit Decline / Dead Deal. Terminal. */
  lostCount: Measured;
  lostDollars: Measured;
  /** True when the buckets foot exactly to total open jobs. */
  foots: boolean;
  /** Present when Hold - Permit carries jobs — Mark's ruling is pending. */
  permitFlag: string | null;
};

const BUCKETS: readonly { key: BacklogBucket["key"]; label: string; note: string }[] = [
  { key: "hoa", label: "Hold — HOA", note: "Awaiting HOA / architectural approval." },
  {
    key: "permit",
    label: "Hold — Permit",
    note: "Awaiting permit issue. Own bucket pending Mark's ruling; collapsing later is a one-line change.",
  },
  {
    key: "other_pending",
    label: "Other pending",
    note: "Open, not yet released, not blocked on HOA or permit.",
  },
];

const NO_SNAP = "no Job Status snapshot for this market";
const NO_COHORT = "this Job Status snapshot predates the 2026-08-07 cohort realign";

export function buildTier5(rolled: readonly RolledFact[], marketCode: string): Tier5 {
  // Stock semantics: no period gate. Every current job_status_ytd row for the
  // market IS the answer, whatever window the rest of the page is showing.
  const js = forMarket(
    rolled.filter((r) => r.report_type === "job_status_ytd"),
    marketCode,
  );
  const asOf = js[0]?.as_of_date ?? null;

  const read = (bucket: string) => {
    const s = sumMetric(js, "good_business_open", { bucket });
    return {
      count: s.seen ? measured(s.count) : unmeasured(NO_SNAP),
      dollars: s.seen ? measured(dollarsOf(s.cents) ?? 0) : unmeasured(NO_SNAP),
      rawCount: s.seen ? s.count : null,
      rawDollars: s.seen ? (dollarsOf(s.cents) ?? 0) : null,
    };
  };

  const read5 = BUCKETS.map((b) => ({ def: b, ...read(b.key) }));
  const buckets: BacklogBucket[] = read5.map((r) => ({
    key: r.def.key,
    label: r.def.label,
    note: r.def.note,
    count: r.count,
    dollars: r.dollars,
  }));

  const exc = sumMetric(js, "pipeline_excluded", { bucket: "in_production" });
  const excludedCount = exc.seen ? measured(exc.count) : unmeasured(NO_SNAP);
  const excludedDollars = exc.seen ? measured(dollarsOf(exc.cents) ?? 0) : unmeasured(NO_SNAP);

  // Terminal outcomes. Report 133 became a CONTRACT-DATE COHORT on 2026-08-07:
  // it now carries every status, mostly terminal (March 2026: 331 completed and
  // 167 lost against just 2 open holds). These are deliberately kept OUT of
  // pendingCount / openJobsTotal — a completed or cancelled job is not open
  // backlog — but they are read and shown, because cancellation and
  // credit-decline volume by market is the reporting value of that export.
  // Both are absent for periods ingested before the realign; unmeasured, not 0.
  const comp = sumMetric(js, "cohort_completed", { bucket: "completed" });
  const lost = sumMetric(js, "cohort_lost", { bucket: "lost" });
  const completedCount = comp.seen ? measured(comp.count) : unmeasured(NO_COHORT);
  const completedDollars = comp.seen ? measured(dollarsOf(comp.cents) ?? 0) : unmeasured(NO_COHORT);
  const lostCount = lost.seen ? measured(lost.count) : unmeasured(NO_COHORT);
  const lostDollars = lost.seen ? measured(dollarsOf(lost.cents) ?? 0) : unmeasured(NO_COHORT);

  const sumOf = (pick: (r: (typeof read5)[number]) => number | null): number | null =>
    read5.reduce<number | null>((acc, r) => {
      const v = pick(r);
      return v == null ? acc : (acc ?? 0) + v;
    }, null);

  const pc = sumOf((r) => r.rawCount);
  const pd = sumOf((r) => r.rawDollars);
  const pendingCount = pc == null ? unmeasured(NO_SNAP) : measured(pc);
  const pendingDollars = pd == null ? unmeasured(NO_SNAP) : measured(Math.round(pd * 100) / 100);

  const openJobsTotal =
    pendingCount.known && excludedCount.known
      ? measured(pendingCount.value + excludedCount.value)
      : unmeasured(NO_SNAP);

  // Footing proof: the bucket counts must reconstruct the total with nothing
  // left over. Equality here is the whole claim the tier makes.
  const foots =
    openJobsTotal.known &&
    pendingCount.known &&
    excludedCount.known &&
    pendingCount.value + excludedCount.value === openJobsTotal.value;

  const permitBucket = read5.find((r) => r.def.key === "permit");
  const permitFlag =
    permitBucket?.rawCount && permitBucket.rawCount > 0
      ? `Hold - Permit is shipping as its own bucket (${permitBucket.rawCount} jobs). Confirm or collapse into Other pending.`
      : null;

  return {
    meta: {
      tier: 5,
      title: "Backlog",
      question: "What is sitting open right now, and what is blocking it?",
      basis: "point_in_time",
      basisDetail: asOf ? `as of ${asOf} — ignores the period filter` : "ignores the period filter",
      source: "Job Status (point-in-time)",
    },
    asOf,
    buckets,
    pendingCount,
    pendingDollars,
    excludedCount,
    excludedDollars,
    openJobsTotal,
    completedCount,
    completedDollars,
    lostCount,
    lostDollars,
    foots,
    permitFlag,
  };
}
