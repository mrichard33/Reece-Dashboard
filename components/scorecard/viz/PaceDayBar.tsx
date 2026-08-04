import { SC_COLOR } from "./colors";

/**
 * Per-day pace: actual vs the daily target line (plan ÷ period selling days).
 * Null target/actual = not computable — no NSLI history, or no completed selling
 * days yet (first of the month) — rendered "—" with no bar/marker, never NaN.
 */
export function PaceDayBar({
  label,
  target,
  actual,
}: {
  label: string;
  target: number | null;
  actual: number | null;
}) {
  const max = Math.max(target ?? 0, actual ?? 0) * 1.1 || 1;
  const behind = actual != null && target != null && actual < target;
  const actualCls =
    actual == null
      ? "font-semibold text-slate-400 dark:text-slate-500"
      : behind
        ? "font-semibold text-amber-600 dark:text-amber-400"
        : "font-semibold text-emerald-600 dark:text-emerald-400";
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="font-mono text-[12px] tabular">
          <span className={actualCls}>{actual == null ? "—" : actual.toFixed(1)}</span>
          <span className="text-slate-400"> / {target == null ? "—" : target.toFixed(1)}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        {actual != null && (
          <div
            className="sc-anim absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${(actual / max) * 100}%`,
              background: behind ? SC_COLOR.amber : SC_COLOR.emerald,
            }}
          />
        )}
        {target != null && (
          <div
            className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded bg-slate-500 dark:bg-slate-300"
            style={{ left: `${(target / max) * 100}%` }}
            title={`Target ${target.toFixed(1)}/day`}
          />
        )}
      </div>
    </div>
  );
}
