import Link from "next/link";
import type { Route } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { StatusTimeline } from "@/components/health/StatusTimeline";
import { dotClass } from "@/lib/queries/systemStatus.core";
import { SEVERITY_TONE } from "@/lib/queries/incidents.core";
import type { CheckView, Segment, SystemGroup } from "@/lib/queries/systemHealth.core";
import { attentionLine, familyWord, plainTimes, severityWord, showSeverity } from "@/lib/health/words";
import { cn, relTime } from "@/lib/utils";

/**
 * The eight system cards on /system-health: a 24-hour strip, then each check
 * with its color (a ring = test mode), last summary or a stale note. Tap a
 * check for what it checks, when it turns yellow and red, and why it matters
 * (a <details>, so it works by tap, never only on hover).
 *
 * Plain English (the user, 2026-10-15): the severity word (Urgent / High /
 * Medium / Low) shows only on a red or yellow row, never the check id or the
 * word "shadow", and a check that is not built yet says "Coming later".
 */
export function SystemCards({ systems, timelines, only }: { systems: SystemGroup[]; timelines: Record<string, Segment[]>; only: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {systems.filter((s) => !only || s.id === only).map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("inline-block h-3 w-3 shrink-0 rounded-full", dotClass(s.color, s.hollow))} aria-hidden />
                <h2 className="truncate font-display text-sm font-semibold text-navy-900 dark:text-slate-100">{s.label}</h2>
              </span>
              <span className="text-xs text-slate-500">{s.families.length ? attentionLine(s.counts) : "No checks"}</span>
            </div>
            <InfoPopover helpKey={`systemHealth.system.${s.id}`} />
          </CardHeader>
          <CardContent>
            <StatusTimeline segments={timelines[s.id] ?? []} label={s.label} />
            {s.families.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No checks for this system.</p>
            ) : (
              s.families.map((f) => (
                <div key={f.family} className="mt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{familyWord(f.family)}</p>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {f.checks.map((c) => <CheckRow key={c.id} c={c} />)}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CheckRow({ c }: { c: CheckView }) {
  const later = c.comingLater;
  const badge = !later && showSeverity(c.color);
  return (
    <li className="py-2">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2">
          <span className={cn("mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full", dotClass(c.color, c.hollow))} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-navy-900 dark:text-slate-100">{c.label}</span>
            {later ? (
              <span className="block text-xs text-slate-400 dark:text-slate-500">Coming later</span>
            ) : (
              <span className="block break-words text-xs text-slate-500 dark:text-slate-400">
                {plainTimes(c.staleNote ?? c.summary ?? "—")}
                {c.observedAt ? ` · ${relTime(c.observedAt)}` : ""}
              </span>
            )}
          </span>
          {badge && (
            <span className="shrink-0">
              <Badge tone={SEVERITY_TONE[c.severity] ?? "slate"}>{severityWord(c.severity)}</Badge>
            </span>
          )}
        </summary>
        <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <p><span className="font-semibold">What it checks:</span> {plainTimes(c.question)}</p>
          <p><span className="font-semibold">Turns yellow when:</span> {plainTimes(c.warnRule)}</p>
          <p><span className="font-semibold">Turns red when:</span> {plainTimes(c.failRule)}</p>
          {c.businessImpact && <p><span className="font-semibold">Why it matters:</span> {plainTimes(c.businessImpact)}</p>}
          <p className="text-slate-400">How often: {plainTimes(c.cadence)}</p>
          <Link href={`/system-health/${encodeURIComponent(c.id)}` as Route} className="inline-block pt-1 font-medium text-navy-700 underline dark:text-sky-300">
            Open check
          </Link>
        </div>
      </details>
    </li>
  );
}
