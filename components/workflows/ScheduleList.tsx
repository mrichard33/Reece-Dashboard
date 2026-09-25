import type { ScheduleRow } from "@/lib/journey/workflowGraph";
import { formatMinutes } from "@/lib/journey/workflowGraph";
import { Badge } from "@/components/ui/Badge";
import type { StepSends } from "@/lib/workflows/sendActivity";
import { Mail, MessageSquare } from "lucide-react";

/**
 * The linear send schedule. Each row opens (native <details>, no client JS)
 * to the full body and sender; the branch path sits under the title so a
 * send that only some contacts get says which ones.
 */
export function ScheduleList({ rows, sends = {} }: { rows: ScheduleRow[]; sends?: Record<string, StepSends> }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">This workflow sends no SMS or email.</p>;
  }
  // The path every send shares is the workflow's entry route — say it once.
  const shared = commonPrefix(rows.map((r) => r.branchPath));
  return (
    <>
    {shared.length > 0 && (
      <p className="pb-2 text-[11px] text-slate-500">Every send below is on the path: {shared.join(" › ")}</p>
    )}
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((r) => {
        const own = r.branchPath.slice(shared.length);
        const Icon = r.type === "email" ? Mail : MessageSquare;
        return (
          <li key={r.stepId}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="w-32 shrink-0 font-mono text-xs tabular-nums text-slate-500">
                  Day {r.day} · +{formatMinutes(r.offsetMinutes)}
                </span>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-navy-900 dark:text-slate-100">
                    {r.type === "email" ? "Email" : "SMS"} {r.n}
                  </span>{" "}
                  <span className="text-slate-600 dark:text-slate-300">
                    {r.type === "email" && r.subject ? `Subject: ${r.subject}` : `“${r.preview}”`}
                  </span>
                  {r.from && <span className="text-slate-400"> · From: {r.from}</span>}
                  {own.length > 0 && <span className="block text-[11px] text-slate-400">if: {own.join(" › ")}</span>}
                  {r.waitNotes.length > 0 && (
                    <span className="block text-[11px] text-slate-400">{r.waitNotes.join(" · ")}</span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  {sends[r.stepId] && sends[r.stepId]!.sends !== null && (
                    <Badge tone={sends[r.stepId]!.sends === 0 ? "rose" : "emerald"}>
                      {sends[r.stepId]!.sends === 0 ? "no sends · 30 d" : `${sends[r.stepId]!.sends!.toLocaleString()} sent · 30 d${sends[r.stepId]!.basis === "stamp" ? "" : " ≈"}`}
                    </Badge>
                  )}
                  {r.aiWritten && <Badge tone="sky">AI-written</Badge>}
                  {r.unparsedWait && <Badge tone="amber">unreadable wait</Badge>}
                </span>
              </summary>
              <div className="mb-3 ml-[8.75rem] space-y-1 rounded-md bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                <p className="text-slate-500">
                  Step: {r.name}
                  {r.templateId && ` · template ${r.templateId}`}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{plain(r.body) || "(no body stored)"}</p>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function commonPrefix(paths: string[][]): string[] {
  if (paths.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const v = paths[0]![i];
    if (v === undefined || paths.some((p) => p[i] !== v)) return out;
    out.push(v);
  }
}

function plain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
