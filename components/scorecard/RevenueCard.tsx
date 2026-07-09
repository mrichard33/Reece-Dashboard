import type { ReactNode } from "react";
import { num, usd } from "@/lib/utils";
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

export function RevenueCard({ vm, aside }: { vm: ScorecardVM; aside?: ReactNode }) {
  const r = vm.revenue;

  const soldLines: Line[] = [
    { label: "Sales count", value: num(r.salesCount) },
    { label: "Gross sold", value: usd(r.gross) },
    { label: "Cancellations", value: `${num(r.cancelledCount)} · ${usd(r.impliedCancelled)}`, tone: "red" },
    { label: "Surviving good business", value: usd(r.net), strong: true },
  ];

  const netLines: Line[] = [
    { label: "Released", note: "recognized", value: usd(r.released) },
    { label: "Working", value: usd(r.working) },
    { label: "Other", value: usd(r.other) },
    ...(r.bucketsComplete
      ? []
      : [{ label: "Earlier months", note: "pre-bucket", value: usd(r.unbucketed) } as Line]),
    { label: "Net (Good Business)", value: usd(r.net), strong: true },
  ];

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 items-start gap-4 ${aside ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <SplitCard
          title="Sold this period"
          subtitle="Sold-date basis"
          accent="border-t-2 border-t-[#0C2340] dark:border-t-slate-200"
          lines={soldLines}
        />
        <SplitCard
          title="Net (Good Business) breakdown"
          subtitle="Net-date basis"
          accent="border-t-2 border-t-sky-400"
          lines={netLines}
        />
        {aside}
      </div>

      <p className="flex items-start gap-1.5 px-1 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
        <span aria-hidden className="mt-px text-slate-400">ⓘ</span>
        <span>
          Net rarely equals Sold in the same period — jobs net when they release (HOA, permits,
          financing, production), often months later.
          {!r.bucketsComplete && (
            <span className="mt-1 block text-slate-400">
              Net buckets tracked from June 2026 — earlier months contribute to Net (Good Business)
              but aren&apos;t split into Released / Working / Other.
            </span>
          )}
        </span>
      </p>
    </div>
  );
}
