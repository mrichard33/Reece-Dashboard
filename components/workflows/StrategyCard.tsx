import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { BUYER_STAGE_LABEL, CLASSIFICATION_LABEL, isStale, VERDICT_LABEL, verdictCounts, type Verdict, type WorkflowInsight } from "@/lib/workflows/insights";

export const VERDICT_TONE: Record<Verdict, "emerald" | "rose" | "amber" | "slate"> = {
  ok: "emerald",
  early_pitch: "rose",
  over_educating: "amber",
  premature_positioning: "rose",
  no_reason_to_act: "amber",
  off_voice: "amber",
  other: "slate",
};

/**
 * Three lines a non-marketer can read at the top of a workflow page: what it
 * is trying to do, the angle it uses, and where momentum breaks.
 */
export function StrategyCard({ insight, currentVersion, ghlWorkflowId }: { insight: WorkflowInsight; currentVersion: number | null; ghlWorkflowId: string }) {
  const counts = verdictCounts(insight.messages);
  const stale = isStale(insight, currentVersion);
  const cls = insight.summary.classification;
  return (
    <section className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Strategy <InfoPopover helpKey="workflows.strategy" align="left" />
        </h2>
        <Badge tone={cls === "healthy" ? "emerald" : cls === "structure" ? "slate" : "amber"}>{CLASSIFICATION_LABEL[cls].split(" — ")[0]}</Badge>
        {stale && (
          <span title="The workflow was edited after this review">
            <Badge tone="amber">
              Reviewed at v{insight.analysed_version} — now v{currentVersion}
            </Badge>
          </span>
        )}
        <Link href={`/workflows/${ghlWorkflowId}?tab=strategy` as Route} className="ml-auto text-xs text-sky-700 hover:underline dark:text-sky-400">
          Message by message →
        </Link>
      </div>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
        <dt className="text-slate-500">Written for</dt>
        <dd className="text-navy-900 dark:text-slate-100">{BUYER_STAGE_LABEL[insight.buyer_stage]}</dd>
        <dt className="text-slate-500">What it does</dt>
        <dd className="text-navy-900 dark:text-slate-100">{insight.summary.strategy}</dd>
        <dt className="text-slate-500">The angle</dt>
        <dd className="text-navy-900 dark:text-slate-100">
          {insight.summary.angle}
          {insight.summary.arcs.length > 0 && <span className="text-slate-400"> · {insight.summary.arcs.join(", ")}</span>}
        </dd>
        <dt className="text-slate-500">Where it breaks</dt>
        <dd className="text-navy-900 dark:text-slate-100">{insight.summary.momentum_break ?? <span className="text-emerald-700">Momentum holds through the sequence.</span>}</dd>
        <dt className="text-slate-500">Why</dt>
        <dd className="text-slate-600 dark:text-slate-300">{insight.summary.why}</dd>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1">
        {(Object.keys(counts) as Verdict[])
          .filter((v) => counts[v] > 0)
          .map((v) => (
            <Badge key={v} tone={VERDICT_TONE[v]}>
              {counts[v]} · {VERDICT_LABEL[v]}
            </Badge>
          ))}
      </div>
    </section>
  );
}
