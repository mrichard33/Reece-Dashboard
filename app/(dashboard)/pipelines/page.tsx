import { ChevronRight } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { StageBars } from "@/components/viz/StageBars";
import { AgingLegend } from "@/components/viz/AgingLegend";
import { PipelineSyncButton } from "@/components/pipelines/PipelineSyncButton";
import { SyncFreshnessBanner } from "@/components/tiles/SyncFreshnessBanner";
import { getPipelineCards } from "@/lib/queries/pipelines";
import { getHealthSnapshot } from "@/lib/queries/health";
import { num, usd, relTime, absTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const user = await requireUser();
  const [cards, health] = await Promise.all([
    getPipelineCards(),
    getHealthSnapshot(),
  ]);

  const hlSync = "error" in health.hlSync ? null : health.hlSync.last_sync_at;
  const lpSync = "error" in health.lpSync ? null : health.lpSync.last_sync_at;

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Pipelines"
        subtitle="Stage distributions across all pipelines. Color = aging in stage."
      />

      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SyncFreshnessBanner lpLastSync={lpSync} hlLastSync={hlSync} />
          <AgingLegend />
        </div>

        {cards.length === 0 && (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No pipelines found in the HL cache. Trigger a sync, or verify
                pipeline data exists in GHL.
              </p>
            </CardContent>
          </Card>
        )}

        {cards.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex flex-1 items-center gap-3">
                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-navy-900 px-2 text-[11px] font-bold text-white dark:bg-white dark:text-navy-900">
                  {p.badge}
                </span>
                <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
                  {p.name}
                </h3>
                <InfoPopover helpKey="pipelines.dataLineage" />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500">
                  <span className="font-mono tabular text-slate-800 dark:text-slate-200">
                    {num(p.count)}
                  </span>{" "}
                  opps · {usd(p.totalValue)} total
                </span>
                <PipelineSyncButton />
              </div>
            </CardHeader>
            <CardContent>
              {p.stages.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  No stages defined.
                </p>
              ) : (
                <StageBars stages={p.stages} />
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Avg cycle{" "}
                    <span className="font-mono tabular text-slate-800 dark:text-slate-200">
                      {p.avgCycleDays}d
                    </span>
                  </span>
                  <span>
                    Stuck (&gt;14d){" "}
                    <span
                      className={`font-mono tabular ${p.stuckCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"}`}
                    >
                      {num(p.stuckCount)}
                    </span>
                  </span>
                  <span>
                    Last advance{" "}
                    <span
                      className="font-mono tabular text-slate-800 dark:text-slate-200"
                      title={absTime(p.lastAdvanceAt)}
                    >
                      {relTime(p.lastAdvanceAt)}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  disabled
                  aria-label="Open detail (Phase 2)"
                  title="Stage drill-down — Phase 2"
                  className="inline-flex cursor-not-allowed items-center gap-1 text-xs font-medium text-slate-400"
                >
                  Open detail
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
