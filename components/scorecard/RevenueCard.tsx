import { num, usd, usDate } from "@/lib/utils";
import { InfoPopover } from "@/components/help/InfoPopover";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ③ — FOUR panels, each declaring its own basis, with NO arithmetic
 * crossing between them (§2, ruled 2026-08-06).
 *
 *   SOLD THIS PERIOD      sold date · report 137 · respects the period filter
 *   RELEASED THIS PERIOD  RTP milestone date · report 134 · respects the filter
 *   LOST THIS PERIOD      contract-date cohort · report 133 · respects the
 *                         filter; split by CAUSE, never sourced from ko_count
 *   OPEN BACKLOG          point-in-time · report 133 · IGNORES the period
 *                         filter, honors the market filter, shows its as-of
 *
 * WHAT THIS REPLACES. The old second panel ran one subtraction down a single
 * column: gross → −cancellations → net sold → −HOA → −permit → −other →
 * "Remaining net (released)". The first three lines are a PERIOD FLOW
 * (sold-date, this period). The last three are a POINT-IN-TIME STOCK from the
 * Job Status report — open jobs, including ones sold in prior periods and prior
 * YEARS. Subtracting a stock from a flow does not produce a smaller number, it
 * produces a number that means nothing: in the 3-Month view it took YTD-wide
 * holds off three months of sales, and in MTD off two days. It is also why
 * "Remaining net (released)" rendered BLANK in MTD and 3-Month — the operation
 * could not resolve.
 *
 * The rule now: a panel may total its own lines and nothing else. Open Backlog
 * foots to total open jobs on its own terms; Sold nets its own cancellations.
 * No line in one panel is an input to another.
 */

type Line = { label: string; note?: string; value: string; tone?: "plain" | "red"; strong?: boolean };

/**
 * Lineage lives behind the ⓘ, not above the number.
 *
 * These panels each carried a two-line basis string in 11px grey — provenance
 * competing with the figure it qualifies, on the row people come here to read.
 * The strings are the audit trail and are NOT deleted; they move into the
 * popover, which is what `InfoPopover`'s inline `info` prop exists for (the
 * released panel's basis is derived at runtime and cannot be a registry entry).
 */
function SplitCard({
  title,
  info,
  accent,
  lines,
  banner,
}: {
  title: string;
  info: { title?: string; what: string; where: string; fix: string };
  accent: string;
  lines: Line[];
  /**
   * Set ONLY when the card is off its primary source, and says so in one place
   * for the whole card.
   *
   * This does not reopen the rule above — routine lineage stays behind the ⓘ.
   * A FALLBACK is not lineage, it is an exception: the figures below are not
   * the ones the card normally shows, and a reader who screenshots the panel
   * has to be able to see that without opening anything. That is exactly what
   * went wrong here — a card half-filled from the live sync was read as report
   * 137 and looked broken.
   */
  banner?: string | null;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 ${accent}`}
    >
      <div className="flex items-start justify-between gap-2 px-5 pb-2.5 pt-4">
        <h3 className="font-display text-[12.5px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
          {title}
        </h3>
        <InfoPopover info={{ title, ...info }} align="right" className="-mt-0.5 shrink-0" />
      </div>
      {banner && (
        <div className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-[11px] leading-snug text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
          {banner}
        </div>
      )}
      <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800/70 dark:border-slate-800/70">
        {lines.map((l) => (
          <div
            key={l.label}
            className={`flex items-baseline justify-between gap-3 px-5 py-2.5 ${l.strong ? "bg-slate-50/70 dark:bg-slate-900/50" : ""}`}
          >
            <div className="min-w-0">
              <span className={`text-[12.5px] ${l.strong ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
                {l.label}
              </span>
              {l.note && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-400">{l.note}</span>}
            </div>
            <span
              className={`shrink-0 font-mono text-[14px] tabular ${l.strong ? "font-bold" : "font-semibold"} ${
                l.tone === "red" ? "text-brick" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {l.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** count + dollars for a pending bucket; null → "not yet sourced", never $0. */
const bucketValue = (b: { count: number; dollars: number } | null): string =>
  b == null ? "not yet sourced" : `${num(b.count)} · ${usd(b.dollars)}`;

export function RevenueCard({ vm }: { vm: ScorecardVM }) {
  const r = vm.revenue;
  const f = r.facts;
  // Pending period (no report has landed yet, main 2026-08-04): dollar figures
  // derived from a missing net render "—", never $0. The facts fields carry
  // their own nullability; `pending` guards the non-facts fallbacks below.
  const pending = r.reportPending;

  // Sold this period, from report 137:
  //   count = NumSold · gross = GSA · cancels = the EXPLICIT cancellations
  //   bucket · gross after cancels = GSA − cancels · Net (Report 137 NSA).
  // The last two are different numbers and carry different labels — see the
  // note above `soldLines`.
  // Cancellation value is NEVER the gross−net residual (the 2026-08-05
  // defect rendered cancellations equal to gross sold and surviving $0).
  // Without a facts snapshot covering this period, count/gross fall back to
  // the scorecard actuals and the cancel lines show "—" (usd/num null-safe).
  // ── THE FALLBACK IS A DECISION ABOUT THE WHOLE CARD, NOT PER LINE ─────────
  //
  // This used to fall back per row: count and gross quietly switched to the live
  // LP sync while Cancellations and Net — which have no live-sync equivalent —
  // rendered "not yet sourced". So the card showed 142 sales / $3,278,106 from
  // one system directly above two rows labelled "Report 137" from another, with
  // nothing saying the top half had changed basis. 137's own answer for that
  // same period was 150 / $3,408,689: a reader could not tell the two apart, and
  // the panel looked broken when it was merely mixed.
  //
  // Now the card decides ONCE. When 137 answers, every line is 137. When it does
  // not, the card says so in its subtitle, the two 137-only rows say what they
  // need rather than a bare "not yet sourced", and the figures that DO come from
  // the sync are labelled as the sync's. One basis per card, stated on the card.
  const soldSourced = f.soldCount != null;
  // In a pending period the legacy gross computes from zeroed buckets — a
  // fabricated $0; fall back to "—" instead (usd(null)).
  const fallbackGross = pending ? null : r.gross;
  /** Named so every fallen-back row carries the same words. */
  const SYNC = "live LP sync";
  const NEEDS_137 = "needs report 137";
  // A covering snapshot can source the flow figures and still have no net —
  // an MTD Sales Efficiency pull prints a blank Net column. Say why rather
  // than showing a bare dash (and never a $0, which reads as "all cancelled").
  const netValue = f.netAfterCancels != null
    ? usd(f.netAfterCancels)
    : f.netPendingReason
      ? "still maturing"
      : usd(null);
  // TWO DIFFERENT NUMBERS, TWO DIFFERENT LABELS.
  //
  // "Gross after cancels" is gross − cancellations. NSA additionally subtracts
  // credit declines, holds and working. Both are legitimate; sharing one label
  // is not. Fort Myers, 2026-08: $844,765 after cancels against $343,676 NSA —
  // ~$501K apart, $466,188 of it sitting in working alone.
  //
  // This is load-bearing rather than cosmetic. July's apparent net-to-gross
  // collapse to 50.9% was $2.6M in hold and working — money not yet released,
  // NOT lost business. Reading NSA under a "net after cancels" label turns a
  // maturity curve into a cancellation crisis.
  //
  // The bottom line is also no longer blank in an MTD view: gross − cancelled
  // is computable while the Net column is still maturing, which is exactly when
  // the old row rendered "still maturing" and left the panel footless.
  // ⚠️ CANCELLATIONS ARE NOT LISTED HERE. They live on "Lost this period",
  // which owns the loss detail and splits it by cause (cancelled vs credit
  // decline). Showing "Cancellations 8 · $242,976" here as well put the same
  // eight jobs on two cards under two headings from two different reports —
  // report 137 here, report 133 there — which reads as a contradiction the
  // moment the two disagree, and as duplication when they agree.
  //
  // This card keeps the WATERFALL: what was written, what survives cancellation,
  // what LP nets it to. "Gross after cancels" is the effect of the cancellations;
  // the line items behind it belong to the Lost card.
  const soldLines: Line[] = [
    {
      label: "Total sales count",
      note: soldSourced ? undefined : SYNC,
      value: num(soldSourced ? f.soldCount : r.salesCount),
    },
    {
      label: "Gross sales value",
      note: soldSourced ? undefined : SYNC,
      value: usd(soldSourced ? f.grossSold : fallbackGross),
    },
    // NOTE: no "Cancellations" row — see the block comment above.
    {
      label: "Gross after cancels",
      note: soldSourced ? "gross − cancels" : NEEDS_137,
      value: f.grossAfterCancels != null ? usd(f.grossAfterCancels) : "—",
      strong: f.grossAfterCancels != null,
    },
    // NSA keeps the word "Net", and nothing else on this panel may use it.
    {
      label: "Net (Report 137 NSA)",
      note: soldSourced ? "LP net" : NEEDS_137,
      value: soldSourced ? netValue : "—",
      strong: f.grossAfterCancels == null,
    },
  ];

  // RELEASED THIS PERIOD — RTP milestone date (report 134). One figure on its
  // own basis; it is NOT gross-sold minus anything.
  //
  // Prefer report 134 itself. This panel's subtitle claimed "report 134" while
  // the value came from lp_market_scorecard_daily, which is fed by the LP API
  // sync — on 2026-08-10 that table was four days stale and showed $702,506
  // against report 134's own $2,052,603. The fallback remains, but it now says
  // so rather than borrowing the report's name.
  const releasedSourced = f.netReleased != null;
  const releasedLines: Line[] = [
    {
      label: "Net released",
      value: releasedSourced ? usd(f.netReleased) : pending ? usd(null) : usd(r.released),
      strong: true,
    },
    ...(releasedSourced && f.releasedJobCount != null
      ? [{ label: "Jobs released", value: num(f.releasedJobCount) } as Line]
      : []),
  ];

  // Derived, never hardcoded — a fixed provenance string is exactly how this
  // panel came to claim a source it was not reading.
  const releasedNote = releasedSourced
    ? `Basis: RTP milestone date · report 134 · ${vm.abbr}${f.releasedAsOf ? ` · as of ${usDate(f.releasedAsOf)}` : ""}`
    : `Basis: RTP milestone date · ${vm.abbr} · FALLBACK: live sync table${
        vm.snapshot.asOfDate ? `, data through ${usDate(vm.snapshot.asOfDate)}` : ""
      } — no report 134 snapshot covers this period`;

  // ── D1: RTP's coverage note belongs HERE, not on a page banner ────────────
  //
  // This note used to render as a page-level amber banner whose own text said
  // it "affects the Released panel only" — a page-level alarm that documented
  // its own irrelevance to the rest of the page, and one that fired on a panel
  // report 134 no longer feeds any sales figure from.
  //
  // The rule D1 sets: a source that feeds exactly ONE panel raises a note on
  // that panel. Only a source feeding the page's primary figures may raise a
  // page-level banner. RTP feeds this card and nothing else.
  //
  // Computed here rather than passed in, so the note cannot drift from the
  // figure it describes.
  const rtpTrails =
    f.releasedAsOf != null &&
    vm.snapshot.asOfDate != null &&
    f.releasedAsOf < vm.snapshot.asOfDate;
  const releasedWhere = rtpTrails
    ? `${releasedNote} — RTP reaches ${usDate(f.releasedAsOf!)}, behind the counts. Not late: dated by production milestone rather than contract date, so it answers a different question and moves on its own clock.`
    : releasedNote;

  // LOST THIS PERIOD — report 133's terminal cohort, split by CAUSE.
  //
  // The `lost` bucket was one undifferentiated number covering four completely
  // different management conversations. A credit decline is a finance problem;
  // a cancellation is a sales problem; a dead deal is a follow-up problem;
  // cancelled-by-management is a margin or capacity call. Company-wide, Credit
  // Decline alone is 340 of 976 losses — 35% — and was invisible.
  //
  // NOT `ko_count`. That column measures something else on another cohort and
  // will disagree; the tile said "not yet sourced" precisely because the daily
  // table has no cancellation column to point at.
  const lostSourced = f.lostTotalCount != null;
  const lostLines: Line[] = lostSourced
    ? [
        ...f.lostByCause.map(
          (c): Line => ({
            label: c.label,
            value: `${num(c.count)} · ${usd(c.dollars)}`,
            tone: "red",
          }),
        ),
        {
          label: "= Total lost",
          value: `${num(f.lostTotalCount)} · ${usd(f.lostTotalDollars)}`,
          strong: true,
        },
      ]
    : [{ label: "Lost jobs", value: "not yet sourced", strong: true }];

  // OPEN BACKLOG — a point-in-time STOCK from the Job Status report. Every line
  // here is an open job as of the report's own date, regardless of when it was
  // sold. The buckets foot to Total open by construction. No minus signs: this
  // panel subtracts nothing from anything.
  const backlogLines: Line[] = [
    { label: "Held — HOA", note: "pending", value: bucketValue(f.pendingHoa) },
    { label: "Held — Permit", note: "pending", value: bucketValue(f.pendingPermit) },
    { label: "Other pending", note: "pre-release", value: bucketValue(f.pendingOther) },
    {
      label: "= Total open",
      value:
        f.pendingTotal == null
          ? "not yet sourced"
          : `${num(f.pendingCount)} · ${usd(f.pendingTotal)}`,
      strong: true,
    },
  ];

  const scopeNote = f.soldScope === "mtd" ? "month-to-date pull"
    : f.soldScope === "ytd" ? "year-to-date pull"
    : f.soldScope === "month" ? "full-month pull"
    : null;
  const basisNote =
    f.soldBasis === "sales_efficiency"
      ? `Sales Efficiency report (137) — authoritative per-market funnel, explicit cancellations${scopeNote ? ` · ${scopeNote}` : ""}`
      : f.soldBasis === "control_totals"
        ? "Company control totals (Marketing report) — fallback until a covering 137 snapshot exists"
        : f.soldBasis === "lead_attributed"
          ? "Lead-attributed basis (fallback) — company totals come from the Marketing report"
          : "No report snapshot covers this period yet";

  // The rule every panel shares, repeated in each popover so it is reachable
  // from whichever one the reader opened. It used to live in a paragraph under
  // the row that most people scrolled past.
  const NO_CROSSING =
    "A panel totals its own lines and nothing else — no figure here is subtracted " +
    'from a figure in another panel. "Not yet sourced" and "—" mean no report ' +
    "covers this view yet; neither is a zero.";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SplitCard
          title="Sold this period"
          info={{
            what:
              "Contract value written in the selected period, on SOLD date. The waterfall: what was written, what survives cancellation, what LP nets it to. " +
              "The cancellation LINE ITEMS are on Lost this period, which owns loss and splits it by cause — they are not repeated here, because the same jobs under two headings from two different reports reads as a contradiction the moment the reports disagree. " +
              "Two bottom lines, deliberately: Gross after cancels = gross − cancellations. " +
              "Net (Report 137 NSA) is LP's figure and subtracts cancellations, credit declines, holds AND working. " +
              "They are not the same number — on Fort Myers in August 2026 they differ by about $501K, most of it working — so they never share a label.",
            where: `Basis: sold date · ${basisNote}${f.soldAsOf ? ` · as of ${usDate(f.soldAsOf)}` : ""}`,
            fix: `${NO_CROSSING}${f.netPendingReason ? ` Net (Report 137 NSA) reads "still maturing" because ${f.netPendingReason}. Gross after cancels is unaffected — it needs only gross and the cancellations bucket.` : ""}`,
          }}
          accent="border-t-2 border-t-navy-900 dark:border-t-slate-200"
          lines={soldLines}
          // The whole card fell back, so it says so once — rather than two rows
          // quietly changing source while two others read "not yet sourced".
          banner={
            soldSourced
              ? null
              : "Report 137 has not landed for this period. Count and gross below are the " +
                "live LP sync — a different system, and usually a different number. Gross " +
                "after cancels and Net are report-137-only and cannot be shown from the sync."
          }
        />
        <SplitCard
          title="Released this period"
          info={{
            what: "Contract value RELEASED to production in the selected period, dated by the production milestone. A different cohort from Sold — it includes work contracted in earlier periods and excludes work sold this period that has not shipped.",
            where: releasedWhere,
            fix: NO_CROSSING,
          }}
          accent="border-t-2 border-t-emerald-500"
          lines={releasedLines}
        />
        <SplitCard
          title="Lost this period"
          info={{
            what:
              "Jobs from this period's contract cohort that ended in a terminal status, split by cause. Four different problems: a credit decline is finance, a cancellation is sales, a dead deal is follow-up, and cancelled-by-management is a margin or capacity call." +
              (f.lostUnresolvedCount > 0
                ? ` ${num(f.lostUnresolvedCount)} of these (${usd(f.lostUnresolvedDollars)}) carry no resolvable branch code, so per-market figures will not foot to this total by that amount.`
                : ""),
            where: lostSourced
              ? `Basis: contract-date cohort · report 133 · ${vm.abbr}${f.lostAsOf ? ` · as of ${usDate(f.lostAsOf)}` : ""}`
              : "No report 133 snapshot covers this period yet",
            fix:
              `${NO_CROSSING} Deliberately NOT sourced from the live sync's ko_count — that is a different measure on a different cohort ` +
              `(12 for August against 14 lost jobs in the same window) and the two disagree by design.`,
          }}
          accent="border-t-2 border-t-brick"
          lines={lostLines}
        />
        <SplitCard
          title="Open backlog"
          info={{
            what: "Open jobs as of the report's own date — a point-in-time STOCK, not a period flow. It ignores the period filter and includes jobs sold in earlier periods and earlier years.",
            where: `Basis: point-in-time · report 133 · as of ${f.pendingAsOf ? usDate(f.pendingAsOf) : usDate(vm.snapshot.asOfDate)}`,
            fix: NO_CROSSING,
          }}
          accent="border-t-2 border-t-sky-400"
          lines={backlogLines}
        />
      </div>
    </div>
  );
}
