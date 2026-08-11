import { num, usd, usDate } from "@/lib/utils";
import { InfoPopover } from "@/components/help/InfoPopover";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ③ — THREE panels, each declaring its own basis, with NO arithmetic
 * crossing between them (§2, ruled 2026-08-06).
 *
 *   SOLD THIS PERIOD      sold date · report 137 · respects the period filter
 *   RELEASED THIS PERIOD  RTP milestone date · report 134 · respects the filter
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
}: {
  title: string;
  info: { title?: string; what: string; where: string; fix: string };
  accent: string;
  lines: Line[];
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

  // Sold this period — the five-line structure from the Marketing report:
  //   count = NumSold · gross = GSA · cancels = (NumSold − NumNetSold) ·
  //   (GSA − NSA) · net after cancels = NSA.
  // Cancellation value is NEVER the gross−net residual (the 2026-08-05
  // defect rendered cancellations equal to gross sold and surviving $0).
  // Without a facts snapshot covering this period, count/gross fall back to
  // the scorecard actuals and the cancel lines show "—" (usd/num null-safe).
  const soldSourced = f.soldCount != null;
  // In a pending period the legacy gross computes from zeroed buckets — a
  // fabricated $0; fall back to "—" instead (usd(null)).
  const fallbackGross = pending ? null : r.gross;
  // A covering snapshot can source the flow figures and still have no net —
  // an MTD Sales Efficiency pull prints a blank Net column. Say why rather
  // than showing a bare dash (and never a $0, which reads as "all cancelled").
  const netValue = f.netAfterCancels != null
    ? usd(f.netAfterCancels)
    : f.netPendingReason
      ? "still maturing"
      : usd(null);
  const soldLines: Line[] = [
    { label: "Total sales count", value: num(soldSourced ? f.soldCount : r.salesCount) },
    { label: "Gross sales value", value: usd(soldSourced ? f.grossSold : fallbackGross) },
    {
      label: "Cancellations",
      value: f.cancelCount == null ? "not yet sourced" : `${num(f.cancelCount)} · ${usd(f.cancelValue)}`,
      tone: "red",
    },
    { label: "Net sales after cancels", value: netValue, strong: true },
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
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <SplitCard
          title="Sold this period"
          info={{
            what: "Contract value written in the selected period, on SOLD date, with cancellations shown explicitly rather than derived as a gross-minus-net residual.",
            where: `Basis: sold date · ${basisNote}${f.soldAsOf ? ` · as of ${usDate(f.soldAsOf)}` : ""}`,
            fix: `${NO_CROSSING}${f.netPendingReason ? ` Net sold reads "still maturing" because ${f.netPendingReason}.` : ""}`,
          }}
          accent="border-t-2 border-t-navy-900 dark:border-t-slate-200"
          lines={soldLines}
        />
        <SplitCard
          title="Released this period"
          info={{
            what: "Contract value RELEASED to production in the selected period, dated by the production milestone. A different cohort from Sold — it includes work contracted in earlier periods and excludes work sold this period that has not shipped.",
            where: releasedNote,
            fix: NO_CROSSING,
          }}
          accent="border-t-2 border-t-emerald-500"
          lines={releasedLines}
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
