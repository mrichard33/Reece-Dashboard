import { SC_COLOR } from "./colors";
import { Term } from "./Term";

/**
 * A rate vs its target on a 0–max track. Fill is emerald when meeting target
 * (rose when not); a slate tick marks the target. The delta shows a `%` suffix
 * per the client's preference (these are percentage-point gaps). KO % passes
 * higher=false (lower is better).
 */
export function BulletBar({
  label,
  actual,
  target,
  higher = true,
  max = 100,
  desc,
}: {
  label: string;
  actual: number;
  target: number;
  higher?: boolean;
  max?: number;
  desc?: string;
}) {
  const good = higher ? actual >= target : actual <= target;
  const delta = actual - target;
  const aw = Math.max(0, Math.min(100, (actual / max) * 100));
  const tw = Math.max(0, Math.min(100, (target / max) * 100));
  const color = good ? SC_COLOR.emerald : SC_COLOR.rose;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
            <Term k={label}>{label}</Term>
          </span>
          {desc && <span className="text-[11px] text-slate-400">{desc}</span>}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[14px] font-semibold tabular text-slate-900 dark:text-slate-100">
            {actual.toFixed(1)}%
          </span>
          <span
            className={`font-mono text-[11px] tabular ${good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
          >
            {(delta >= 0 ? "+" : "") + delta.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="sc-anim absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${aw}%`, background: color }}
        />
        <div
          className="absolute -bottom-1 -top-1 w-0.5 rounded bg-slate-500 dark:bg-slate-300"
          style={{ left: `${tw}%` }}
          title={`Target ${target}%`}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular text-slate-400">
        <span>0</span>
        <span>target {target}%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}
