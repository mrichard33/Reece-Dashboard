import { StatTile } from "@/components/tiles/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, relTime } from "@/lib/utils";
import { avgLatencyMs, type LlmUsageSummary, type UsageBucket } from "@/lib/queries/llmUsage";
import { aiUsd, latencyLabel } from "@/lib/queries/llmUsage.core";
import { AiUsageTrend } from "./AiUsageTrend";

function costText(b: UsageBucket): string {
  if (b.calls === 0) return "—";
  if (b.costUsd === null) return "tokens only";
  // aiUsd, not usd/usdExact: AI spend is often under a dollar, usd rounds to whole
  // dollars, and usdExact drops cents that round to zero ($0.004 read "$0").
  return aiUsd(b.costUsd);
}

function costDelta(b: UsageBucket): { text: string | undefined; tone: "amber" | "slate" } {
  if (b.calls === 0) return { text: undefined, tone: "slate" };
  if (b.costUsd === null) return { text: "no rates set (LLM_PRICE_TABLE_JSON)", tone: "amber" };
  if (b.unpricedCalls > 0) return { text: `${num(b.unpricedCalls)} calls unpriced`, tone: "amber" };
  return { text: undefined, tone: "slate" };
}

/** "avg 1.8s", or with failures "3 failed · avg 1.8s". */
function callsDelta(b: UsageBucket): string | undefined {
  const avg = avgLatencyMs(b);
  const parts = [
    b.errors > 0 ? `${num(b.errors)} failed` : null,
    avg !== null ? `avg ${latencyLabel(avg)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function compactTokens(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(2)}M`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}k`;
  return num(t);
}

export function AiUsageSection({ usage }: { usage: LlmUsageSummary }) {
  const todayCost = costDelta(usage.today);
  const weekCost = costDelta(usage.last7d);
  const stale = usage.lastCallStale;
  // Chart cost once any call in the window has a price; until then, calls.
  const trendMetric = usage.trend.some((d) => d.cost !== null) ? "cost" : "calls";

  return (
    <section>
      <h2 className="mb-3 flex flex-wrap items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        AI usage
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal ring-1 ring-inset ${
            stale
              ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
              : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
          }`}
          title="Every model call LP-MCP makes is logged to llm_usage_log as it happens. This chip is the time of the most recent call."
        >
          {usage.available
            ? usage.lastCallAt
              ? `last call ${relTime(usage.lastCallAt)}${stale ? " · stale" : ""}`
              : "no calls logged yet"
            : "ledger not available"}
        </span>
      </h2>

      {!usage.available ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-slate-500">
              AI usage ledger is not readable yet — apply LP-MCP sql/151 (llm_usage_log) on LP Supabase.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 lg:col-span-1 lg:grid-cols-2">
            <StatTile label="Calls today" value={num(usage.today.calls)} delta={callsDelta(usage.today)} deltaTone={usage.today.errors > 0 ? "rose" : "slate"} helpKey="overview.aiCalls" />
            <StatTile label="Tokens today" value={compactTokens(usage.today.tokens)} helpKey="overview.aiTokens" />
            <StatTile label="Cost today" value={costText(usage.today)} delta={todayCost.text} deltaTone={todayCost.tone} helpKey="overview.aiCost" />
            <StatTile label="Cost 7d" value={costText(usage.last7d)} delta={weekCost.text} deltaTone={weekCost.tone} helpKey="overview.aiCost" />
          </div>

          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>By function · today</CardTitle>
              <InfoPopover helpKey="overview.aiByFunction" />
            </CardHeader>
            <CardContent>
              {usage.byFnToday.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No model calls yet today.</p>
              ) : (
                // Scrolls inside the card and drops the Model column on phones
                // (mobile ruling 2026-09-26) — function names are long mono text.
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="pb-2 font-semibold">Function</th>
                        <th className="hidden pb-2 font-semibold sm:table-cell">Model</th>
                        <th className="pb-2 pl-3 text-right font-semibold">Calls</th>
                        <th className="pb-2 pl-3 text-right font-semibold">Tokens</th>
                        <th className="hidden pb-2 pl-3 text-right font-semibold sm:table-cell">Avg time</th>
                        <th className="pb-2 pl-3 text-right font-semibold">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {usage.byFnToday.map((r) => (
                        <tr key={`${r.fn}|${r.model}`}>
                          <td className="break-all py-1.5 pr-2 font-mono text-[12px] text-navy-900 dark:text-slate-100">{r.fn}</td>
                          <td className="hidden max-w-[12rem] truncate py-1.5 pr-2 text-[12px] text-slate-500 sm:table-cell dark:text-slate-400">{r.model}</td>
                          <td className="tabular py-1.5 pl-3 text-right">{num(r.calls)}{r.errors > 0 && <span className="block whitespace-nowrap text-[11px] text-rose-600 sm:ml-1 sm:inline sm:text-sm dark:text-rose-400">({r.errors} failed)</span>}</td>
                          <td className="tabular py-1.5 pl-3 text-right">{compactTokens(r.tokens)}</td>
                          <td className="tabular hidden py-1.5 pl-3 text-right sm:table-cell">{latencyLabel(avgLatencyMs(r))}</td>
                          <td className="tabular py-1.5 pl-3 text-right">{aiUsd(r.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 lg:col-span-3">
            <CardHeader>
              <CardTitle>{trendMetric === "cost" ? "Daily AI cost" : "Daily AI calls"} · 30d</CardTitle>
              <InfoPopover helpKey="overview.aiTrend" />
            </CardHeader>
            <CardContent>
              <AiUsageTrend data={usage.trend} metric={trendMetric} />
              {trendMetric === "calls" && usage.trend.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Showing calls: no call in this window has a price. Costs appear for calls made
                  after LP-MCP&apos;s <code>LLM_PRICE_TABLE_JSON</code> is set.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
