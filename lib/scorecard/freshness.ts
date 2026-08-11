/**
 * Freshness vocabulary for the scorecard header.
 *
 * The chip used to read "live · provisional". It was neither: on 2026-08-10
 * `lp_market_scorecard_daily` had not advanced since 2026-08-07, so "live"
 * described a table that had been still for four days, and "provisional" was
 * never defined anywhere a reader could reach.
 *
 * A freshness label has one job — say how old the number is. It says the date.
 *
 * Pure functions, calendar injected, so `vitest` (which collects `lib/**` only)
 * can assert on the exact strings the page renders.
 */

import { addDays, isSellingDay, type SellingCalendar } from "@/lib/date/sellingDays";
import { usDate } from "@/lib/utils";

export type FreshnessTone = "neutral" | "amber" | "emerald";

export type FreshnessChip = {
  /** Rendered chip text. Never contains the word "Live". */
  text: string;
  /** Hover definition — this is where "provisional" is actually defined. */
  title: string;
  tone: FreshnessTone;
};

const PROVISIONAL_DEF =
  "Provisional: computed from the live LP sync, not yet reconciled to the official " +
  "Net Report. It is an estimate for the in-progress month and is expected to move " +
  "when the month closes and the report lands.";

/**
 * The header chip. `computedFrom` mirrors `lp_market_scorecard_daily.computed_from`:
 * `net_report_rtp` is a closed, report-sourced month; `mixed` spans closed and live
 * months; anything else is the live sync alone.
 */
export function freshnessChip(input: {
  asOfDate: string | null;
  computedFrom: string | null;
  /**
   * `scorecard_report_snapshots.is_partial_month` — true when the file was
   * generated at or before its own period_end, so it does not cover the whole
   * period it declares. NULL means unknown (legacy PDF snapshots carry no
   * reliable generation time) and must never be read as false.
   */
  isPartial?: boolean | null;
  /** `period_end` the partial file reaches — the date it is partial THROUGH. */
  partialThrough?: string | null;
}): FreshnessChip {
  // A partial file is a different claim from a stale one: the data is current,
  // it just does not cover all of the period it names. Saying "Data through" for
  // it would overstate coverage, so the prefix changes rather than the date.
  //
  // Only an explicit true triggers this. Under [DAYOFFSET(-1)] it should never
  // fire — it exists to make a scheduling regression visible instead of silently
  // publishing a short day as a whole one.
  const partial = input.isPartial === true;
  const through = input.partialThrough ?? input.asOfDate;

  const when = partial && through
    ? `Partial through ${usDate(through)}`
    : input.asOfDate
      ? `Data through ${usDate(input.asOfDate)}`
      : "No data";

  // A partial file cannot be an exact closed-month reading, whatever
  // computed_from says — the period it declares is not fully covered.
  if (partial) {
    return {
      text: `${when} · Partial`,
      title:
        "This report was generated before the period it covers had ended, so it " +
        `does not include every day through ${through ? usDate(through) : "the period end"}. ` +
        "Treat the totals as incomplete rather than low.",
      tone: "amber",
    };
  }

  if (input.computedFrom === "net_report_rtp") {
    return {
      text: `${when} · Net Report actual`,
      title:
        "Closed month, report-sourced — ties to the official Net Report " +
        "(Released-to-Production) to the penny. Not an estimate.",
      tone: "emerald",
    };
  }
  if (input.computedFrom === "mixed") {
    return {
      text: `${when} · Report + provisional`,
      title:
        "This range spans closed months (report-sourced and exact) and the " +
        `in-progress month (an estimate). ${PROVISIONAL_DEF}`,
      tone: "amber",
    };
  }
  return { text: `${when} · Provisional`, title: PROVISIONAL_DEF, tone: "amber" };
}

/**
 * How many SELLING days the data is behind the last completed selling day.
 *
 * Counts days strictly after `dataThrough` up to and including `lastCompleted`,
 * so a snapshot written this morning for yesterday reports 0 — up to date, not
 * "one day behind". Null when there is no date to compare.
 *
 * Deliberately measured against the last completed selling day rather than the
 * end of the selected range: on the 10th of a month, a range ending on the 31st
 * is not evidence that anything is stale.
 */
export function stalenessSellingDays(
  dataThrough: string | null,
  lastCompleted: string,
  cal: SellingCalendar,
): number | null {
  if (!dataThrough) return null;
  if (dataThrough >= lastCompleted) return 0;
  let count = 0;
  for (let cur = addDays(dataThrough, 1); cur <= lastCompleted; cur = addDays(cur, 1)) {
    if (isSellingDay(cur, cal)) count++;
  }
  return count;
}

/** "3 selling days behind" / "1 selling day behind"; null when current. */
export function stalenessPhrase(days: number | null): string | null {
  if (days == null || days <= 0) return null;
  return `${days} selling day${days === 1 ? "" : "s"} behind`;
}
