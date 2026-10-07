import type { RouteStep, ScheduleRow } from "@/lib/journey/workflowGraph";
import { formatMinutes } from "@/lib/journey/workflowGraph";
import { Badge } from "@/components/ui/Badge";
import { stepSendsWords, type StepSends } from "@/lib/workflows/sendActivity";
import { routeName, type RouteGroup, type ScheduleRoutes } from "@/lib/workflows/scheduleRoutes";
import { ChevronRight, CornerDownRight, GitFork, Mail, MessageSquare, Repeat } from "lucide-react";
import { emailToPlainText } from "@/lib/journey/emailText";
import { EmailPreviewButton } from "./EmailPreviewButton";

/**
 * Every message the workflow can send. Each row opens (native <details>, no
 * client JS) to the full body and sender; email rows also carry "View email",
 * a pop-up with the rendered template (2026-09-26).
 *
 * 2026-10-07: grouped by ROUTE. A workflow with forks (if/else, A/B split,
 * "wait until … or give up") shows one section per route, worded like the
 * flowchart's arrows, so it is clear which messages a lead gets together.
 * A workflow with no forks still reads as one plain list.
 */
export function ScheduleList({ rows, routes, sends = {} }: { rows: ScheduleRow[]; routes?: ScheduleRoutes; sends?: Record<string, StepSends> }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">This workflow sends no SMS or email.</p>;
  }
  const groups = routes?.groups ?? [];
  if (!routes || groups.length < 2) {
    return (
      <>
        {routes && routes.shared.length > 0 && <SharedLine steps={routes.shared} />}
        <MessageRows rows={groups[0]?.rows ?? rows} sends={sends} onlyIf={routes?.onlyIf} />
      </>
    );
  }
  const branched = groups.filter((g) => g.number > 0).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-300">
        This workflow splits into <strong>{branched} route{branched === 1 ? "" : "s"}</strong>. A lead gets the messages of one route at a time; each route
        lists the choices that lead to it, in the same words as the flowchart. Times are from when the lead entered the workflow.
      </p>
      {routes.shared.length > 0 && <SharedLine steps={routes.shared} />}
      {groups.map((g) => (
        <RouteSection key={g.key} group={g} sends={sends} onlyIf={routes.onlyIf} />
      ))}
    </div>
  );
}

function SharedLine({ steps }: { steps: RouteStep[] }) {
  return (
    <p className="pb-1 text-[11px] text-slate-500">
      Every message below comes after: {steps.map((s) => `${s.decision} → ${s.answer}`).join(" › ")}
    </p>
  );
}

function RouteSection({ group, sends, onlyIf }: { group: RouteGroup; sends: Record<string, StepSends>; onlyIf: Record<string, string[]> }) {
  const n = group.rows.length;
  return (
    <details open className="group/route rounded-lg ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
      <summary className="flex cursor-pointer list-none items-start gap-2 rounded-t-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-open/route:rotate-90" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-navy-900 dark:text-slate-100">{group.number === 0 ? "Everyone gets these" : routeName(group.number)}</span>
            <span className="text-xs text-slate-500">
              {n} message{n === 1 ? "" : "s"}
            </span>
          </span>
          {group.number === 0 ? (
            <span className="block text-xs text-slate-500">Sent before the workflow splits.</span>
          ) : (
            <>
              {group.after !== null && <span className="block text-xs text-slate-500">After {routeName(group.after)}, then:</span>}
              <RouteSteps steps={group.newSteps} />
            </>
          )}
        </span>
      </summary>
      <div className="px-3">
        <MessageRows rows={group.rows} sends={sends} onlyIf={onlyIf} />
        {(group.continues.length > 0 || group.splitsInto.length > 0) && (
          <ul className="space-y-1 border-t border-slate-100 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
            {group.splitsInto.length > 0 && (
              <li className="flex items-start gap-1.5">
                <GitFork className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 break-words">
                  Then splits at <strong className="font-medium">{group.splitsInto[0]!.via.decision.replace(/^If: /, "")}</strong>:{" "}
                  {group.splitsInto.map((x) => `${routeName(x.number)} (${x.via.answer.split(" · ")[0]})`).join(", ")}
                </span>
              </li>
            )}
            {group.continues.map((c, i) => {
              const where = c.routeNumbers.filter((x) => x !== group.number).map(routeName);
              const Icon = c.loop ? Repeat : CornerDownRight;
              return (
                <li key={i} className="flex items-start gap-1.5">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 break-words">
                    {c.when.length > 0 && <>If {c.when.map((s) => `${s.decision} → ${s.answer}`).join(" › ")}: </>}
                    {c.loop ? "goes back to " : "then carries on at "}
                    <strong className="font-medium">{c.atLabel}</strong>
                    {where.length > 0 && <> ({c.loop ? "and on to " : "the rest is listed under "}{where.join(", ")})</>}
                    {c.loop && where.length === 0 && " and repeats"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

function RouteSteps({ steps }: { steps: RouteStep[] }) {
  return (
    <ol className="mt-1 space-y-0.5 text-xs">
      {steps.map((s, i) => (
        <li key={i} className="break-words text-slate-600 dark:text-slate-300">
          <span className="text-slate-400">{s.decision}</span> <span className="text-slate-400">→</span> <span className="font-medium">{s.answer}</span>
        </li>
      ))}
    </ol>
  );
}

function MessageRows({ rows, sends, onlyIf = {} }: { rows: ScheduleRow[]; sends: Record<string, StepSends>; onlyIf?: Record<string, string[]> }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((r) => {
        const Icon = r.type === "email" ? Mail : MessageSquare;
        const words = sends[r.stepId] && sends[r.stepId]!.sends !== null ? stepSendsWords(sends[r.stepId]) : null;
        return (
          <li key={r.stepId}>
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-start gap-x-3 gap-y-1 py-2 sm:flex-nowrap hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="w-full shrink-0 font-mono sm:w-32 text-xs tabular-nums text-slate-500">
                  Day {r.day} · +{formatMinutes(r.offsetMinutes)}
                </span>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-navy-900 dark:text-slate-100">
                    {r.type === "email" ? "Email" : "SMS"} {r.n}
                  </span>{" "}
                  <span className="break-words text-slate-600 dark:text-slate-300">
                    {r.type === "email" && r.subject ? `Subject: ${r.subject}` : `“${r.preview}”`}
                  </span>
                  {r.from && <span className="text-slate-400"> · From: {r.from}</span>}
                  {onlyIf[r.stepId] && <span className="block break-words text-[11px] text-slate-500">only if: {onlyIf[r.stepId]!.join(" · ")}</span>}
                  {r.waitNotes.length > 0 && <span className="block text-[11px] text-slate-400">{r.waitNotes.join(" · ")}</span>}
                </span>
                <span className="flex w-full shrink-0 flex-wrap gap-1 pl-6 sm:w-auto sm:pl-0">
                  {words && <Badge tone={words.tone === "none" ? "rose" : words.tone === "ok" ? "emerald" : "slate"}>{words.text}</Badge>}
                  {/* The switch itself, even when send counts did not load. */}
                  {!words && r.disabled && <Badge tone="rose">turned off in GHL</Badge>}
                  {r.aiWritten && <Badge tone="sky">AI-written</Badge>}
                  {r.unparsedWait && <Badge tone="amber">unreadable wait</Badge>}
                </span>
              </summary>
              <div className="mb-3 space-y-1 sm:ml-[8.75rem] rounded-md bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                <p className="text-slate-500">
                  Step: {r.name}
                  {r.templateId && ` · template ${r.templateId}`}
                </p>
                <Body html={r.body} />
                {r.type === "email" && r.body.trim() && (
                  <EmailPreviewButton html={r.body} subject={r.subject} from={r.from} className="mt-2" />
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** The body as plain words; the hidden inbox-preview line is labelled, not mixed in. */
function Body({ html }: { html: string }) {
  const { preheader, text } = emailToPlainText(html);
  return (
    <>
      {preheader && <p className="text-slate-500">Inbox preview: {preheader}</p>}
      <p className="whitespace-pre-wrap leading-relaxed">{text || "(no body stored)"}</p>
    </>
  );
}
