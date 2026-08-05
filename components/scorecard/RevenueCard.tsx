import type { ReactNode } from "react";
import { num, usd, usDate } from "@/lib/utils";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ③ — Sold vs Net. Two equal cards that reconcile to the same number:
 *
 *   SOLD THIS PERIOD (sold-date basis)  — Sales, Gross sold, Cancellations, and
 *      the surviving good business (= gross − cancellations).
 *   NET (GOOD BUSINESS) BREAKDOWN (net-date basis) — Released (the only slice
 *      recognized), Working, Other, totaling the same Net (Good Business).
 *
 * Both totals are identical by construction on reconciled data; the caption
 * explains why sold and net rarely coincide within one period.
 */

type Line = { label: string; note?: string; value: string; tone?: "plain" | "red"; strong?: boolean };

function SplitCard({
  title,
  subtitle,
  accent,
  lines,
}: {
  title: string;
  subtitle: string;
  accent: string;
  lines: Line[];
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 ${accent}`}
    >
      <div className="px-5 pb-2.5 pt-4">
        <h3 className="font-display text-[12.5px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
          {title}
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{subtitle}</p>
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

export function RevenueCard({ vm, aside }: { vm: ScorecardVM; aside?: ReactNode }) {
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
  const soldLines: Line[] = [
    { label: "Total sales count", value: num(soldSourced ? f.soldCount : r.salesCount) },
    { label: "Gross sales value", value: usd(soldSourced ? f.grossSold : fallbackGross) },
    {
      label: "Cancellations",
      value: f.cancelCount == null ? "not yet sourced" : `${num(f.cancelCount)} · ${usd(f.cancelValue)}`,
      tone: "red",
    },
    { label: "Net sales after cancels", value: usd(f.netAfterCancels), strong: true },
  ];

  // Net (Good Business) — gross → −cancels → net, then the open-pipeline
  // holds (stock from the Job Status report: HOA / Permit / Other pending,
  // each count · $), leaving released remaining. Buckets foot to total open
  // jobs by construction; a missing source renders "not yet sourced".
  const netLines: Line[] = [
    { label: "Gross sales", value: usd(soldSourced ? f.grossSold : fallbackGross) },
    {
      label: "− Cancellations",
      value: f.cancelValue == null ? "not yet sourced" : usd(f.cancelValue),
      tone: "red",
    },
    { label: "= Net sold", value: usd(f.netAfterCancels), strong: true },
    { label: "− Held: HOA", note: "pending", value: bucketValue(f.pendingHoa) },
    { label: "− Held: Permit", note: "pending", value: bucketValue(f.pendingPermit) },
    { label: "− Other pending", note: "pre-release", value: bucketValue(f.pendingOther) },
    { label: "= Remaining net (released)", value: usd(f.releasedRemaining), strong: true },
  ];

  const basisNote =
    f.soldBasis === "sales_efficiency"
      ? "Sales Efficiency report (137) — authoritative per-market funnel, explicit cancellations"
      : f.soldBasis === "control_totals"
        ? "Company control totals (Marketing report) — fallback until a covering 137 snapshot exists"
        : f.soldBasis === "lead_attributed"
          ? "Lead-attributed basis (fallback) — company totals come from the Marketing report"
          : "No report snapshot covers this period yet";

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 items-start gap-4 ${aside ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <SplitCard
          title="Sold this period"
          subtitle={`Sold-date basis · ${basisNote}${f.soldAsOf ? ` · as of ${usDate(f.soldAsOf)}` : ""}`}
          accent="border-t-2 border-t-navy-900 dark:border-t-slate-200"
          lines={soldLines}
        />
        <SplitCard
          title="Net (Good Business) breakdown"
          subtitle={`Net-date basis · holds as of ${f.pendingAsOf ? usDate(f.pendingAsOf) : usDate(vm.snapshot.asOfDate)}`}
          accent="border-t-2 border-t-sky-400"
          lines={netLines}
        />
        {aside}
      </div>

      <p className="flex items-start gap-1.5 px-1 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
        <span aria-hidden className="mt-px text-slate-400">ⓘ</span>
        <span>
          Net rarely equals Sold in the same period — jobs net when they release (HOA, permits,
          financing, production), often months later. Holds are the current open pipeline from the
          Job Status report; &ldquo;not yet sourced&rdquo; and &ldquo;—&rdquo; mean no report covers
          this view yet — neither is a zero.
        </span>
      </p>
    </div>
  );
}
