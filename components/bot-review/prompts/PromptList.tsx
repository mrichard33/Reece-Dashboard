import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/Badge";
import type { PromptSummary } from "@/lib/mcp/prompts";

/**
 * The prompt picker.
 *
 * Server-rendered links rather than a client list: selection lives in the URL
 * (`?prompt=`), the same way the review queue's does, so a half-written draft
 * survives a reload and an operator can send someone a link to one prompt.
 */
export function PromptList({
  prompts,
  selectedId,
}: {
  prompts: PromptSummary[];
  selectedId: string | null;
}) {
  if (prompts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
        <p className="text-sm font-semibold text-navy-900 dark:text-white">No prompts yet.</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          The nurture prompt registry is empty. Apply{" "}
          <span className="font-mono">sql/seed_nurture_prompts_v1.sql</span> in LP Supabase.
        </p>
      </div>
    );
  }

  // Grouped by workflow so the list reads as the funnel does, not as a flat
  // alphabetical dump of codes.
  const groups = new Map<string, PromptSummary[]>();
  for (const p of prompts) {
    const key = p.workflow_code || "Unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {[...groups.entries()].map(([workflow, rows]) => (
          <div key={workflow}>
            <p className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {workflow}
            </p>
            <ul>
              {rows.map((p) => {
                const active = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/bot-review?tab=learned&prompt=${encodeURIComponent(p.id)}` as Route}
                      scroll={false}
                      className={
                        "block border-l-2 px-3 py-2.5 text-left transition " +
                        (active
                          ? "border-navy-800 bg-navy-50 dark:border-navy-300 dark:bg-navy-900/40"
                          : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800")
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-navy-900 dark:text-white">
                          {p.prompt_code}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {p.has_draft && <Badge tone="amber">Draft</Badge>}
                          <Badge tone={p.active ? "emerald" : "slate"}>
                            {p.active ? "Live" : "Off"}
                          </Badge>
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{p.channel}</span>
                        {p.sequence_position != null && <span>· step {p.sequence_position}</span>}
                        {p.story_arc && <span className="truncate">· {p.story_arc}</span>}
                        <span>· v{p.version}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {prompts.length} prompt{prompts.length === 1 ? "" : "s"} ·{" "}
        {prompts.filter((p) => p.active).length} live
      </p>
    </div>
  );
}
