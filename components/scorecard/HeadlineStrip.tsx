import { TrendingDown, TrendingUp } from "lucide-react";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

const WRAP: Record<string, string> = {
  rose: "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10",
  amber: "border-amber-300/70 bg-[#FAF0C9]/50 dark:border-amber-500/30 dark:bg-amber-500/10",
  emerald: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
};
const IC: Record<string, string> = {
  rose: "text-rose-600 dark:text-rose-400",
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
};

/** The page's one-sentence TL;DR verdict, in a status-tinted banner. */
export function HeadlineStrip({ vm }: { vm: ScorecardVM }) {
  const h = vm.headline;
  const Icon = h.behind ? TrendingDown : TrendingUp;
  return (
    <div className={`flex items-start gap-3.5 rounded-lg border px-5 py-4 ${WRAP[h.tone]}`}>
      <Icon size={22} className={`mt-0.5 shrink-0 ${IC[h.tone]}`} />
      <div className="min-w-0">
        <div className="font-display text-[16px] font-semibold text-slate-900 dark:text-slate-100">
          {h.sentence}
        </div>
        <div className="mt-0.5 text-[12.5px] text-slate-600 dark:text-slate-300">
          {h.sub}{" "}
          <a
            href="#sc-pace"
            className="text-[#274560] underline underline-offset-2 hover:text-[#0C2340] dark:text-slate-200 dark:hover:text-white"
          >
            See the pace breakdown ↓
          </a>
        </div>
      </div>
    </div>
  );
}
