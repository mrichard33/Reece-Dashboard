"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { relTime, absTime } from "@/lib/utils";
import { alertCopy, severityMeta } from "@/lib/alerts/alertCopy";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

export function AlertTile({ issue }: { issue: ClaudeKnownIssue }) {
  const [open, setOpen] = useState(false);
  const sev = severityMeta(issue.severity);
  const copy = alertCopy(issue);
  const affected = issue.workflow_name ?? issue.impact ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={sev.tone} dot>
              {sev.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-semibold text-navy-900 dark:text-slate-100">
            {copy.friendlyTitle}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
            {copy.plainExplanation}
          </p>
          {affected && (
            <p className="mt-1 truncate text-[11px] text-slate-500">
              Affects: {affected}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-slate-400">
            Reported {relTime(issue.reported_date)}
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition group-hover:text-slate-500" />
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={copy.friendlyTitle}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <Badge tone={sev.tone} dot>
              {sev.label}
            </Badge>
            <span>Reported {relTime(issue.reported_date)}</span>
          </span>
        }
      >
        <div className="space-y-5 text-sm">
          <Section title="What happened">
            <p className="text-slate-700 dark:text-slate-200">{copy.plainExplanation}</p>
          </Section>

          <Section title="Who / what is affected">
            {affected ? (
              <p className="text-slate-700 dark:text-slate-200">{affected}</p>
            ) : (
              <p className="text-slate-500">No specific workflow or contact recorded.</p>
            )}
            {issue.impact && issue.impact !== affected && (
              <p className="mt-1 text-slate-600 dark:text-slate-300">{issue.impact}</p>
            )}
          </Section>

          <Section title="How important">
            <p className="text-slate-700 dark:text-slate-200">{sev.label}</p>
          </Section>

          <Section title="What to do">
            <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-200">
              {copy.recommendedActions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <Link
              href="/issues"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline dark:text-sky-400"
            >
              Open Issues page <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Section>

          <Section title="Technical details">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <TechRow label="Raw description" value={issue.description} />
              <TechRow label="Category" value={issue.category} />
              <TechRow label="Workflow" value={issue.workflow_name} />
              <TechRow label="Workflow ID" value={issue.workflow_id} mono />
              <TechRow label="Status" value={issue.status} />
              <TechRow label="Reported" value={absTime(issue.reported_date)} />
              {issue.resolved_date && (
                <TechRow label="Resolved" value={absTime(issue.resolved_date)} />
              )}
            </dl>
          </Section>
        </div>
      </Drawer>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TechRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-xs">
      <dt className="flex-shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`text-right text-slate-700 dark:text-slate-200 ${mono ? "break-all font-mono text-[11px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
