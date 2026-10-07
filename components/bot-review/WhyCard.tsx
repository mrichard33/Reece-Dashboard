"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { groupIssues, WHY_CARD_MAX_LINES, type Issue } from "@/lib/botReview/conversation";
import { requestJump } from "./ConversationThread";

/**
 * "Why this is here" — the top of the middle column (2026-10-06).
 *
 * The text is built by code (buildWhyText), never by a model (AI OS
 * CANON.P.001: code decides). Each issue line has a Jump that opens the
 * message's session and brings it into view, so the reviewer reads the problem
 * before the thread. Identical chips are grouped (AI OS CANON.K.009: show only
 * what the step needs).
 */
export function WhyCard({
  text,
  facts,
  issues,
}: {
  text: string;
  facts: Array<{ label: string; value: string; tone?: "rose" | "amber" }>;
  issues: Issue[];
}) {
  const [showAll, setShowAll] = useState(false);
  // 2026-10-07: identical chips are one line ("Sent after outbound paused × 4")
  // with one Jump, and the card stops at six lines. McKoy's card listed 16.
  const groups = groupIssues(issues);
  const shown = showAll ? groups : groups.slice(0, WHY_CARD_MAX_LINES);

  return (
    <section
      aria-label="Why this is here"
      className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Why this is here</h2>
      <p className="mt-1 break-words text-sm leading-relaxed text-navy-900 dark:text-white">{text}</p>

      {facts.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <div
              key={f.label}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1",
                f.tone === "rose"
                  ? "bg-rose-700 text-white ring-rose-700 dark:bg-rose-600 dark:ring-rose-600"
                  : f.tone === "amber"
                    ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800"
                    : "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
              )}
            >
              <dt className="font-medium opacity-80">{f.label}</dt>
              <dd className="truncate font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {issues.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {issues.length} issue{issues.length === 1 ? "" : "s"} found
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {shown.map((g) => (
              <li key={g.label} className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    g.tone === "rose"
                      ? "bg-rose-700 text-white dark:bg-rose-600"
                      : "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
                  )}
                >
                  {g.label}
                  {g.count > 1 ? ` × ${g.count}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => requestJump(g.anchors[0]!)}
                  className="shrink-0 rounded px-2 py-1.5 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
                  aria-label={`Jump to the first message: ${g.label}`}
                >
                  Jump
                </button>
              </li>
            ))}
          </ul>
          {groups.length > WHY_CARD_MAX_LINES && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-1 py-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
            >
              {showAll ? "Show less" : `Show all ${groups.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
