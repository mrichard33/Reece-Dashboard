import { SC_COLOR } from "./colors";

export type RankedItem = { label: string; count: number };

/** Horizontal ranked bars (job status). Navy-600 fill ∝ count/max, count inside. */
export function RankedBars({
  items,
  accent = SC_COLOR.navy600,
}: {
  items: RankedItem[];
  accent?: string;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="w-44 shrink-0 truncate text-[12px] text-slate-600 dark:text-slate-300"
            title={it.label}
          >
            {it.label}
          </div>
          <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800/70">
            <div
              className="sc-anim flex h-full items-center justify-end rounded pr-2"
              style={{ width: `${Math.max((it.count / max) * 100, 6)}%`, background: accent }}
            >
              <span className="font-mono text-[10.5px] font-semibold tabular text-white">
                {it.count}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
