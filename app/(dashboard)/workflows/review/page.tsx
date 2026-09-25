import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { VERDICT_TONE } from "@/components/workflows/StrategyCard";
import { getWorkflowSummary } from "@/lib/queries/workflows";
import {
  BUYER_STAGE_LABEL,
  CLASSIFICATION_LABEL,
  INSIGHTS_META,
  insightsByStage,
  isStale,
  VERDICT_LABEL,
  verdictCounts,
  type Classification,
  type MessageInsight,
  type Verdict,
  type WorkflowInsight,
} from "@/lib/workflows/insights";
import { STAGE_GUIDE, STAGE_ORDER } from "@/lib/workflows/insights/stages";
import { num } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NON_OK: Verdict[] = ["early_pitch", "over_educating", "premature_positioning", "no_reason_to_act", "off_voice", "other"];

/**
 * /workflows/review — the funnel read as one story for people who do not
 * write copy: what each stage should do, what we send there, where the
 * message and the prospect's state of mind disagree (quoted), and what to
 * test. Static analysis data + live send counts and versions.
 */
export default async function FunnelReviewPage() {
  const user = await requireRole("operator");
  const summary = await getWorkflowSummary().catch(() => null);
  const live = new Map((summary?.rows ?? []).map((r) => [r.ghlWorkflowId, r]));
  const byStage = insightsByStage();
  const all = [...byStage.values()].flat();
  const messages = all.flatMap((w) => w.messages.map((m) => ({ w, m })));
  const totals = verdictCounts(messages.map((x) => x.m));
  const cls: Record<Classification, WorkflowInsight[]> = { messaging: [], offer: [], traffic: [], structure: [], healthy: [] };
  for (const w of all) cls[w.summary.classification].push(w);
  const breaks = all.filter((w) => w.summary.momentum_break).sort((a, b) => (live.get(b.ghlWorkflowId)?.sending?.entries30d ?? 0) - (live.get(a.ghlWorkflowId)?.sending?.entries30d ?? 0));

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Funnel review" subtitle="What we send at each stage, and where it is out of step with the prospect" />
      <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 print:max-w-none">
        <Link href={"/workflows" as Route} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 print:hidden">
          <ArrowLeft className="h-4 w-4" /> Back to Workflows
        </Link>

        {all.length === 0 ? (
          <p className="text-sm text-slate-500">No review data yet.</p>
        ) : (
          <>
            {/* Headline */}
            <section className="space-y-3">
              <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-navy-900 dark:text-white">
                Funnel review <InfoPopover helpKey="workflows.review" align="left" />
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Every message in every published workflow, read against the stage of mind the lead is in when it arrives: is it making the problem
                real, teaching, positioning us, or asking for action — and is that the right job at that moment? Reviewed {INSIGHTS_META?.analysed_at}:{" "}
                {num(INSIGHTS_META?.workflows ?? all.length)} workflows, {num(INSIGHTS_META?.messages ?? messages.length)} messages. Workflows edited since carry a
                &quot;changed since&quot; mark.
              </p>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(totals) as Verdict[]).map((v) => (
                  <Badge key={v} tone={VERDICT_TONE[v]}>
                    {totals[v]} · {VERDICT_LABEL[v]}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">What kind of problem is it</h2>
                  <ul className="space-y-1">
                    {(Object.keys(cls) as Classification[]).map((k) => (
                      <li key={k} className="flex items-baseline gap-2">
                        <span className="w-6 text-right font-mono text-xs text-slate-500">{cls[k].length}</span>
                        <span>
                          <span className="font-medium text-navy-900 dark:text-slate-100">{CLASSIFICATION_LABEL[k].split(" — ")[0]}</span>
                          <span className="text-slate-500"> — {CLASSIFICATION_LABEL[k].split(" — ")[1] ?? "working as intended"}</span>
                          {cls[k].length > 0 && <span className="text-slate-400"> · {cls[k].map((w) => w.code).join(", ")}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Where momentum breaks most</h2>
                  <ol className="list-decimal space-y-1 pl-5">
                    {breaks.slice(0, 6).map((w) => (
                      <li key={w.ghlWorkflowId}>
                        <Link href={`/workflows/${w.ghlWorkflowId}?tab=strategy` as Route} className="font-medium text-navy-900 hover:underline dark:text-slate-100">
                          {w.code}
                        </Link>
                        <span className="text-slate-500">
                          {" "}
                          ({num(live.get(w.ghlWorkflowId)?.sending?.entries30d ?? 0)} leads in / 30 d) — {w.summary.momentum_break}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>

            {/* By stage */}
            {STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => {
              const guide = STAGE_GUIDE[stage];
              const wfs = byStage.get(stage) ?? [];
              const problems = wfs.flatMap((w) => w.messages.filter((m) => NON_OK.includes(m.verdict)).map((m) => ({ w, m })));
              const tests = dedupe(problems.map(({ w, m }) => ({ w, m })).filter((x) => x.m.recommendation));
              return (
                <section key={stage} className="space-y-3 break-inside-avoid">
                  <h2 className="border-b border-slate-200 pb-1 font-display text-lg font-semibold text-navy-900 dark:border-slate-800 dark:text-white">{guide.title}</h2>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What this stage should do</h3>
                      <p className="mt-1 text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">Who is reading: </span>
                        {guide.reader}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">The job: </span>
                        {guide.job}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">Should feel like: </span>
                        {guide.shouldFeelLike}
                      </p>
                      <p className="text-rose-700 dark:text-rose-300">
                        <span className="text-slate-500">Must not: </span>
                        {guide.mustNot}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What we send there now</h3>
                      <ul className="mt-1 space-y-1">
                        {wfs.map((w) => {
                          const row = live.get(w.ghlWorkflowId);
                          const c = verdictCounts(w.messages);
                          const bad = w.messages.length - c.ok;
                          return (
                            <li key={w.ghlWorkflowId} className="flex flex-wrap items-baseline gap-x-2">
                              <Link href={`/workflows/${w.ghlWorkflowId}?tab=strategy` as Route} className="font-medium text-navy-900 hover:underline dark:text-slate-100">
                                {w.code} {w.name.replace(new RegExp(`^${w.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "")}
                              </Link>
                              <span className="text-xs text-slate-500">
                                {w.messages.length} messages · {bad === 0 ? "all doing their job" : `${bad} off`}
                                {row?.sending?.verdict === "no_sends_seen" ? " · no sends seen" : row?.sending?.sends30d != null ? ` · ${num(row.sending.sends30d)} sent / 30 d` : ""}
                                {row && isStale(w, row.version) ? " · changed since" : ""}
                              </span>
                              <span className="text-xs text-slate-500">— {w.summary.strategy}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                  {problems.length > 0 && (
                    <div className="text-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where it breaks</h3>
                      <ul className="mt-1 space-y-2">
                        {problems.map(({ w, m }) => (
                          <li key={`${w.ghlWorkflowId}:${m.stepId}`} className="rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/workflows/${w.ghlWorkflowId}?tab=strategy` as Route} className="font-medium text-navy-900 hover:underline dark:text-slate-100">
                                {w.code} · {m.channel === "email" ? "Email" : "SMS"} {m.n ?? ""}
                              </Link>
                              <Badge tone={VERDICT_TONE[m.verdict]}>{VERDICT_LABEL[m.verdict]}</Badge>
                              <span className="text-xs text-slate-500">
                                speaks to {BUYER_STAGE_LABEL[m.stage_actual].split(" — ")[0]}; reader is {BUYER_STAGE_LABEL[m.stage_intended].split(" — ")[0]}
                              </span>
                            </div>
                            {m.quote && <p className="mt-1 italic text-slate-600 dark:text-slate-300">“{m.quote}”</p>}
                            <p className="mt-1 text-slate-700 dark:text-slate-200">
                              <span className="text-slate-500">Job it should do: </span>
                              {m.job}
                            </p>
                            {m.issue && <p className="text-slate-700 dark:text-slate-200">{m.issue}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {tests.length > 0 && (
                    <div className="text-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What to test</h3>
                      <ol className="mt-1 list-decimal space-y-1 pl-5">
                        {tests.slice(0, 8).map(({ w, m }) => (
                          <li key={`${w.ghlWorkflowId}:${m.stepId}`} className="text-slate-700 dark:text-slate-200">
                            <span className="font-medium text-navy-900 dark:text-slate-100">{w.code}:</span> {m.recommendation}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
              );
            })}

            {/* Appendix */}
            <section className="space-y-2">
              <h2 className="border-b border-slate-200 pb-1 font-display text-lg font-semibold text-navy-900 dark:border-slate-800 dark:text-white">By workflow</h2>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Workflow</th>
                      <th className="px-3 py-2">Written for</th>
                      <th className="px-3 py-2">Messages</th>
                      <th className="px-3 py-2">Off</th>
                      <th className="px-3 py-2">Kind of problem</th>
                      <th className="px-3 py-2">Sent / 30 d</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {all
                      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                      .map((w) => {
                        const row = live.get(w.ghlWorkflowId);
                        const c = verdictCounts(w.messages);
                        return (
                          <tr key={w.ghlWorkflowId}>
                            <td className="px-3 py-1.5">
                              <Link href={`/workflows/${w.ghlWorkflowId}?tab=strategy` as Route} className="text-navy-900 hover:underline dark:text-slate-100">
                                {w.code} {w.name}
                              </Link>
                              {row && isStale(w, row.version) && <span className="ml-1 text-[10px] text-amber-700">changed since</span>}
                            </td>
                            <td className="px-3 py-1.5 text-xs">{BUYER_STAGE_LABEL[w.buyer_stage].split(" — ")[0]}</td>
                            <td className="px-3 py-1.5 text-xs tabular-nums">{w.messages.length}</td>
                            <td className="px-3 py-1.5 text-xs tabular-nums">{w.messages.length - c.ok}</td>
                            <td className="px-3 py-1.5 text-xs">{CLASSIFICATION_LABEL[w.summary.classification].split(" — ")[0]}</td>
                            <td className="px-3 py-1.5 text-xs tabular-nums">{row?.sending?.verdict === "no_sends_seen" ? "no sends seen" : row?.sending?.sends30d != null ? num(row.sending.sends30d) : "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function dedupe(items: { w: WorkflowInsight; m: MessageInsight }[]): { w: WorkflowInsight; m: MessageInsight }[] {
  const seen = new Set<string>();
  return items.filter(({ w, m }) => {
    const key = `${w.code}|${(m.recommendation ?? "").slice(0, 60).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
