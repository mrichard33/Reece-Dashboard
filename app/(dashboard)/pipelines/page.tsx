import { ChevronRight } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { StageBars } from "@/components/viz/StageBars";
import { SyncFreshnessBanner } from "@/components/tiles/SyncFreshnessBanner";
import { getPipelineCards } from "@/lib/queries/pipelines";
import { getHealthSnapshot } from "@/lib/queries/health";
import { num, usd } from "@/lib/utils";

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
        subtitle="Open opportunities by pipeline and stage"
      />

      <div className="space-y-6 p-6">
        <SyncFreshnessBanner lpLastSync={lpSync} hlLastSync={hlSync} />

        {cards.length === 0 && (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No pipelines found in the HL cache. Trigger a sync from the
                topbar, or verify pipeline data exists in GHL.
              </p>
            </CardContent>
          </Card>
        )}

        {cards.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex flex-1 items-baseline gap-3">
                <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
                  {p.name}
                </h3>
                <span className="text-xs text-slate-500">
                  <span className="font-mono tabular text-slate-800 dark:text-slate-200">
                    {num(p.count)}
                  </span>{" "}
                  open opps · {usd(p.totalValue)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <InfoPopover helpKey="pipelines.dataLineage" />
                <InfoPopover helpKey="pipelines.total" />
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

              {p.recentOpps.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Recent open opps
                  </h4>
                  <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {p.recentOpps.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-baseline justify-between gap-3 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {o.contact_name}
                          </p>
                          <p className="truncate text-xs font-mono text-slate-500">
                            LP {o.lp_prospect_id ?? "—"}
                          </p>
                        </div>
                        <span className="font-mono tabular text-xs text-slate-500 dark:text-slate-400">
                          {usd(o.monetary_value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">
                  {p.contactsFallback
                    ? "Contact enrichment unavailable — see info popover."
                    : "Click into stages for drill-down detail (Phase 2)."}
                </p>
                <button
                  type="button"
                  disabled
                  aria-label="Drill down (Phase 2)"
                  className="inline-flex cursor-not-allowed items-center gap-1 text-xs text-slate-400"
                >
                  Drill down
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
