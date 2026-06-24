import { num } from "@/lib/utils";

/**
 * Thin freshness strip above the scorecard: which snapshot is shown, when it was
 * computed, and the distinct freshness of raw-leads-in (cache) vs the rest of the
 * row (LP API). Keeps the "as of" provenance visible without opening a popover.
 */
export function FreshnessStrip({
  asOfDate,
  createdAt,
  periodStart,
  periodEnd,
  rawLeadsIn,
  rawLeadsBasis,
  reconciled,
  daysElapsed,
  workingDaysInPeriod,
  expectedAsOf,
}: {
  asOfDate: string;
  createdAt: string | null;
  periodStart: string;
  periodEnd: string;
  rawLeadsIn: number | null;
  rawLeadsBasis?: string;
  reconciled: boolean;
  /** Selling days elapsed through as-of (period numerator). */
  daysElapsed?: number;
  /** Selling days in the full month (period denominator). */
  workingDaysInPeriod?: number | null;
  /** Last completed selling day relative to now; if as-of is behind it, the
   *  daily job likely failed and the snapshot is stale. */
  expectedAsOf?: string;
}) {
  const computed = createdAt
    ? new Date(createdAt).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  const stale = !!expectedAsOf && asOfDate < expectedAsOf;
  const sellingDayLabel =
    daysElapsed != null && workingDaysInPeriod != null
      ? `${daysElapsed} of ${workingDaysInPeriod} selling days`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
      <span>
        Snapshot <span className="font-mono font-semibold">{asOfDate}</span>
      </span>
      <span className="text-slate-300 dark:text-slate-700">·</span>
      <span>
        complete through <span className="font-mono font-semibold">{asOfDate}</span>
        {sellingDayLabel ? <span className="text-slate-400"> ({sellingDayLabel})</span> : null}
      </span>
      <span className="text-slate-300 dark:text-slate-700">·</span>
      <span>
        {periodStart} → {periodEnd}
      </span>
      <span className="text-slate-300 dark:text-slate-700">·</span>
      <span>
        computed <span className="font-mono">{computed} ET</span>
      </span>
      <span className="text-slate-300 dark:text-slate-700">·</span>
      <span title={rawLeadsBasis ?? "lp_leads cache"}>
        raw leads in <span className="font-mono font-semibold">{num(rawLeadsIn)}</span>{" "}
        <span className="text-slate-400">(cache)</span>
      </span>
      {stale ? (
        <span
          className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900"
          title={`Snapshot as-of ${asOfDate} is behind the last completed selling day (${expectedAsOf}) — the daily LP-MCP job (goal-scorecard-daily) may have failed. Check /n8n/admin/goal-scorecard-status.`}
        >
          snapshot stale — job may have failed
        </span>
      ) : null}
      <span className="ml-auto">
        {reconciled ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
            Reconciled
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
            Provisional
          </span>
        )}
      </span>
    </div>
  );
}
