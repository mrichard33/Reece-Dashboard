import { usd } from "@/lib/utils";
import { SC_TONE_FILL, type RevenueTone } from "./colors";

export type RevenueBucket = {
  key: string;
  label: string;
  value: number;
  tone: RevenueTone;
};

/** One stacked bar = the gross-sales identity, with a 2-col swatch legend below. */
export function RevenueStack({
  buckets,
  total,
}: {
  buckets: RevenueBucket[];
  total: number;
}) {
  return (
    <div>
      <div className="flex h-10 w-full overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200 dark:ring-slate-800">
        {buckets.map((b) => {
          const pct = total ? (b.value / total) * 100 : 0;
          return (
            <div
              key={b.key}
              title={`${b.label}: ${usd(b.value)} (${pct.toFixed(0)}%)`}
              className="sc-anim flex h-full items-center justify-center"
              style={{ width: `${pct}%`, background: SC_TONE_FILL[b.tone] }}
            >
              {pct >= 10 && (
                <span className="font-mono text-[11px] font-semibold tabular text-white/95">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: SC_TONE_FILL[b.tone] }}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600 dark:text-slate-300">
              {b.label}
            </span>
            <span className="font-mono text-[12.5px] font-semibold tabular text-slate-900 dark:text-slate-100">
              {usd(b.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
