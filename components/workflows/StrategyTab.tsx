import type { ScheduleRow } from "@/lib/journey/workflowGraph";
import { formatMinutes } from "@/lib/journey/workflowGraph";
import type { StepSends } from "@/lib/workflows/sendActivity";
import { COMPLIANCE_LABEL, complianceFails } from "@/lib/workflows/insights/schema";
import { BUYER_STAGE_LABEL, VERDICT_LABEL, type MessageInsight, type WorkflowInsight } from "@/lib/workflows/insights";
import { Badge } from "@/components/ui/Badge";
import { Mail, MessageSquare } from "lucide-react";
import { VERDICT_TONE } from "./StrategyCard";

const LEVER_WORDS: Record<MessageInsight["lever"], string> = {
  relevance: "Relevance",
  curiosity: "Curiosity",
  hope: "Hope / desire",
  rapport: "Rapport / trust",
  engagement: "Engagement",
  positioning: "Positioning",
  urgency: "Urgency / action",
  none: "No clear lever",
};

const short = (s: number) => BUYER_STAGE_LABEL[s as 1 | 2 | 3 | 4 | 5].split(" — ")[0];

/**
 * Every message in send order: the job it should do, what it does, the
 * verdict, the line that earned it, and what to test.
 */
export function StrategyTab({ insight, schedule, sends }: { insight: WorkflowInsight; schedule: ScheduleRow[]; sends: Record<string, StepSends> }) {
  const byStep = new Map(insight.messages.map((m) => [m.stepId, m]));
  const ordered: { row: ScheduleRow | null; m: MessageInsight }[] = [];
  for (const row of schedule) {
    const m = byStep.get(row.stepId);
    if (m) {
      ordered.push({ row, m });
      byStep.delete(row.stepId);
    }
  }
  for (const m of byStep.values()) ordered.push({ row: null, m });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Written for <strong>{BUYER_STAGE_LABEL[insight.buyer_stage]}</strong>. {insight.summary.strategy}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {ordered.map(({ row, m }) => {
          const Icon = m.channel === "email" ? Mail : MessageSquare;
          const s = sends[m.stepId];
          const mismatch = m.stage_actual !== m.stage_intended;
          return (
            <li key={m.stepId} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-32 shrink-0 font-mono text-xs text-slate-500">{row ? `Day ${row.day} · +${formatMinutes(row.offsetMinutes)}` : "not on the schedule"}</span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="font-medium text-navy-900 dark:text-slate-100">
                  {m.channel === "email" ? "Email" : "SMS"} {m.n ?? ""}
                </span>
                {row?.subject && <span className="text-slate-600 dark:text-slate-300">— {row.subject}</span>}
                <Badge tone={VERDICT_TONE[m.verdict]}>{VERDICT_LABEL[m.verdict]}</Badge>
                {s && s.sends !== null && (
                  <span className="text-xs text-slate-400">
                    {s.sends.toLocaleString()} sent · 30 d{s.basis === "stamp" ? "" : " ≈"}
                  </span>
                )}
              </div>
              <div className="ml-[8.75rem] mt-1 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[7.5rem_1fr]">
                <span className="text-slate-500">Speaks to</span>
                <span className={mismatch ? "text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-slate-200"}>
                  {short(m.stage_actual)}
                  {mismatch ? ` — but this reader is at ${short(m.stage_intended)}` : " (right stage)"} · lever: {LEVER_WORDS[m.lever]}
                </span>
                <span className="text-slate-500">Its job</span>
                <span className="text-slate-700 dark:text-slate-200">{m.job}</span>
                <span className="text-slate-500">What it does</span>
                <span className="text-slate-700 dark:text-slate-200">{m.does}</span>
                {m.quote && (
                  <>
                    <span className="text-slate-500">The line</span>
                    <span className="italic text-slate-600 dark:text-slate-300">“{m.quote}”</span>
                  </>
                )}
                {m.issue && (
                  <>
                    <span className="text-slate-500">The issue</span>
                    <span className="text-slate-700 dark:text-slate-200">{m.issue}</span>
                  </>
                )}
                {m.recommendation && (
                  <>
                    <span className="text-slate-500">Test this</span>
                    <span className="font-medium text-navy-900 dark:text-slate-100">{m.recommendation}</span>
                  </>
                )}
                {complianceFails(m.compliance).length > 0 && (
                  <>
                    <span className="text-slate-500">Brand rules</span>
                    <span className="text-rose-700 dark:text-rose-300">{complianceFails(m.compliance).map((k) => COMPLIANCE_LABEL[k]).join(" · ")}</span>
                  </>
                )}
                {(m.checks.banned_phrases.length > 0 || !m.checks.booking_path || m.checks.sms_standalone === false) && (
                  <>
                    <span className="text-slate-500">Rules</span>
                    <span className="text-amber-700 dark:text-amber-300">
                      {[
                        m.checks.banned_phrases.length ? `banned wording: ${m.checks.banned_phrases.join(", ")}` : null,
                        !m.checks.booking_path ? "no booking or reply path" : null,
                        m.checks.sms_standalone === false ? "SMS leans on the email" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
