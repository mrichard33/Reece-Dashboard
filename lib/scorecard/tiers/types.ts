/**
 * Shared vocabulary for the five-tier scorecard (restructure 2026-08-05).
 *
 * The old scorecard was organized around DATA SOURCES — five LP reports, three
 * of them on different date bases, rendered side by side. That layout invites a
 * reconciliation that is mathematically impossible, and the resulting "the
 * numbers never match" destroys trust in the whole page.
 *
 * The restructure organizes around DECISIONS instead. Every tier answers one
 * question, sits on ONE date basis, and pages ONE owner. The basis is declared
 * in the tier header — visible, always, never a footnote — and two tiers on
 * different bases are never placed adjacently.
 */

/**
 * The date basis a tier's figures are counted on. These are three genuinely
 * different questions and the reason totals across tiers do not tie:
 *
 *  • `rtp_milestone`  — counted when the job was Released To Production. "What
 *                       did we finish this month?" (Tier 1)
 *  • `appointment`    — counted on the appointment/sold cohort's own date.
 *                       "What is the funnel doing?" (Tiers 2, 3)
 *  • `lead_cohort`    — counted against the leads that were BOUGHT in the
 *                       window. "What did marketing pay for?" (Tier 4)
 *  • `point_in_time`  — a STOCK, not a flow. "What is sitting open right now?"
 *                       Ignores the period filter entirely. (Tier 5)
 */
export type DateBasis = "rtp_milestone" | "appointment" | "lead_cohort" | "point_in_time";

/** Header copy for each basis — one sentence a non-analyst can act on. */
export const BASIS_LABEL: Record<DateBasis, string> = {
  rtp_milestone: "RTP milestone date",
  appointment: "appointment / sold-cohort date",
  lead_cohort: "lead cohort",
  point_in_time: "point in time",
};

export const BASIS_EXPLAINER: Record<DateBasis, string> = {
  rtp_milestone:
    "Counted on the date the job was released to production. This is the month's finished work — it does not tie to sold-date figures and is not meant to.",
  appointment:
    "Counted on the appointment / sold cohort's own date. Answers what the funnel is doing, not what finished this month.",
  lead_cohort:
    "Counted against the leads purchased in this window. Answers what marketing paid for.",
  point_in_time:
    "A stock, not a flow — everything open as of the stamp below. Ignores the period filter by design; the period filter would be meaningless against it.",
};

/**
 * A figure that may legitimately have no value.
 *
 * RULING: a blank renders "—" WITH A REASON, never `$0`. Zero reads as a
 * measurement — "no jobs are held in HOA" — and will be believed. "Not yet
 * sourced" and "zero" are different facts and the page must not conflate them.
 */
export type Measured<T = number> =
  | { known: true; value: T }
  | { known: false; value: null; reason: string };

export const measured = <T>(value: T): Measured<T> => ({ known: true, value });
export const unmeasured = <T = number>(reason: string): Measured<T> => ({
  known: false,
  value: null,
  reason,
});

/** Lift a nullable into a Measured with a stated reason for the null. */
export function fromNullable<T>(v: T | null | undefined, reason: string): Measured<T> {
  return v === null || v === undefined ? unmeasured<T>(reason) : measured(v);
}

/** The value if known, else null — for arithmetic that tolerates absence. */
export const valueOf = <T>(m: Measured<T>): T | null => (m.known ? m.value : null);

/** Who gets paged when this line misses. The point of Tier 2. */
export type Owner =
  | "Marketing / call center"
  | "Call center"
  | "Sales"
  | "Finance / Operations";

/** Common header contract every tier component renders. */
export type TierMeta = {
  /** 1–5. */
  tier: number;
  title: string;
  /** The one question this tier answers. */
  question: string;
  basis: DateBasis;
  /** Concrete window or as-of stamp, already formatted for display. */
  basisDetail: string;
  /** Report(s) behind the figures, named so a reader can go check. */
  source: string;
};
