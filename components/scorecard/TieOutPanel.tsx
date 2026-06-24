import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import type { ScorecardActuals } from "@/lib/queries/scorecard";

/**
 * Admin-only reconciliation aid. Surfaces the tie-out tallies the LP-MCP engine
 * already emits in raw_inputs so Mark can reconcile against the Reece export:
 * the released/working/other/cancelled bucket split (with the identity check),
 * every distinct job status + count, and which dispositions were dropped from demos.
 */
export function TieOutPanel({ actuals }: { actuals: ScorecardActuals }) {
  const ri = actuals.raw_inputs;
  if (!ri) return null;

  const bt = ri.bucket_tally;
  const sumBuckets = bt
    ? bt.released_dollars + bt.working_dollars + bt.other_pending + bt.cancelled_dollars
    : null;
  const identityOk = bt != null && sumBuckets != null && Math.abs(sumBuckets - actuals.gross_sales) <= 1;

  const statusRows = Object.entries(ri.status_tally ?? {}).sort((a, b) => b[1] - a[1]);
  const nonDemoRows = Object.entries(ri.non_demo_tally ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Tie-out / Reconciliation
          </h3>
          <InfoPopover helpKey="scorecard.tieout" />
          <span className="text-xs text-slate-400">Admin · {ri.revenue_basis ?? "—"}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Bucket split + identity */}
          <div>
            <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Revenue buckets</h4>
            {bt ? (
              <dl className="space-y-1 text-sm">
                <Line label="Released (Net Sales)" value={usd(bt.released_dollars)} />
                <Line label="Working (held)" value={usd(bt.working_dollars)} />
                <Line label="Other pending" value={usd(bt.other_pending)} />
                <Line label="Cancelled" value={usd(bt.cancelled_dollars)} />
                <div className="mt-1 border-t border-slate-200 pt-1 dark:border-slate-800">
                  <Line label="Sum" value={usd(sumBuckets!)} />
                  <Line label="Gross Sales" value={usd(actuals.gross_sales)} />
                </div>
                <p className={`mt-1 text-xs font-medium ${identityOk ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {identityOk ? "✓ identity holds (sum = gross)" : "✗ identity off — investigate"}
                </p>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">No bucket_tally in this snapshot.</p>
            )}
          </div>

          {/* Non-demo dispositions */}
          <div>
            <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Dropped from demos</h4>
            {nonDemoRows.length ? (
              <dl className="space-y-1 text-sm">
                {nonDemoRows.map(([code, n]) => (
                  <Line key={code} label={code} value={num(n)} />
                ))}
              </dl>
            ) : (
              <p className="text-sm text-slate-500">None.</p>
            )}
          </div>

          {/* Status tally */}
          <div>
            <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
              Job status tally ({statusRows.length})
            </h4>
            <div className="max-h-56 overflow-y-auto pr-2">
              <dl className="space-y-1 text-sm">
                {statusRows.map(([status, n]) => (
                  <Line key={status} label={status} value={num(n)} />
                ))}
              </dl>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="shrink-0 font-mono tabular text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}
