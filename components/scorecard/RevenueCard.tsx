import { num, usd } from "@/lib/utils";
import { ScCard } from "./ScCard";
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

function LineList({ lines }: { lines: Line[] }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {lines.map((l) => (
        <div key={l.label} className={`flex items-baseline justify-between gap-3 px-5 py-2.5 ${l.strong ? "bg-slate-50/60 dark:bg-slate-900/40" : ""}`}>
          <div className="min-w-0">
            <span className={`text-[12.5px] ${l.strong ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
              {l.label}
            </span>
            {l.note && <span className="ml-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">{l.note}</span>}
          </div>
          <span
            className={`shrink-0 font-mono text-[14px] tabular ${
              l.strong ? "font-bold" : "font-semibold"
            } ${l.tone === "red" ? "text-brick" : "text-slate-900 dark:text-slate-100"}`}
          >
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RevenueCard({ vm }: { vm: ScorecardVM }) {
  const r = vm.revenue;

  const soldLines: Line[] = [
    { label: "Sales", value: num(r.salesCount) },
    { label: "Gross sold", value: usd(r.gross) },
    { label: "Cancellations", note: `${num(r.cancelledCount)} jobs`, value: `− ${usd(r.impliedCancelled)}`, tone: "red" },
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
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ScCard
          id="sc-sold"
          title="Sold this period"
          lead="Everything written on a sale date in this window — before jobs release."
          info={{
            what: "Sold-date basis: gross written this period, minus cancellations, equals the surviving good business.",
            where: "Sales & cancellations from LP raw data for this window.",
            fix: "A large cancellation slice erodes surviving business — review KO reasons.",
          }}
        >
          <div className="py-1.5">
            <LineList lines={soldLines} />
          </div>
        </ScCard>

        <ScCard
          id="sc-net"
          title="Net (Good Business) breakdown"
          lead="The same surviving business, split by how far each dollar has progressed."
          info={{
            what: "Net-date basis: Released is the only slice recognized; Working and Other are still in flight. They sum to Net (Good Business).",
            where: "Revenue buckets from LP raw data for this window.",
            fix: "A large Working/Other share means money is sold but not yet released — chase financing/HOA/permits/production.",
          }}
        >
          <div className="py-1.5">
            <LineList lines={netLines} />
          </div>
        </ScCard>
      </div>

      <p className="px-1 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
        Net rarely equals Sold in the same period — jobs net when they release (HOA, permits,
        financing, production), often months later.
        {!r.bucketsComplete && (
          <span className="mt-1 block text-slate-400">
            Net buckets tracked from June 2026 — earlier months contribute to Net (Good Business)
            but aren&apos;t split into Released / Working / Other.
          </span>
        )}
      </p>
    </div>
  );
}
