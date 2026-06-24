import { Check } from "lucide-react";
import { usd } from "@/lib/utils";
import { pct } from "./format";
import { ScCard } from "./ScCard";
import { RevenueStack } from "./viz/RevenueStack";
import { Term } from "./viz/Term";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Where revenue sits — released vs held vs open vs cancelled, summing to gross. */
export function RevenueCard({ vm }: { vm: ScorecardVM }) {
  const r = vm.revenue;
  const figs: [string, string][] = [
    ["Gross Sales", usd(r.gross)],
    ["Working Rev", usd(r.workingRev)],
    ["Demo %", pct(r.demoPct)],
    ["Trailing NSLI", usd(r.trailingNSLI)],
  ];
  return (
    <ScCard
      id="sc-revenue"
      title="Where revenue sits"
      lead="Of everything sold, how much is released (counts toward goal) vs still held up."
      info={{
        what: "Gross sales split into released, held (working), open quotes and cancelled. Sum equals gross — the tie-out identity.",
        where: "Revenue buckets from LP raw data for this window.",
        fix: "A large held (amber) slice means money is sold but stuck — chase financing/HOA/docs.",
      }}
    >
      <div className="p-5">
        <RevenueStack buckets={r.buckets} total={r.gross} />
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4">
          {figs.map(([k, v], i) => (
            <div key={i}>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                <Term k={k}>{k}</Term>
              </div>
              <div className="mt-1 font-mono text-[15px] font-semibold tabular text-slate-900 dark:text-slate-100">{v}</div>
            </div>
          ))}
        </div>
        {r.identityOk && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400">
            <Check size={14} /> Identity holds — buckets sum to gross sales ({usd(r.gross)}).
          </div>
        )}
      </div>
    </ScCard>
  );
}
