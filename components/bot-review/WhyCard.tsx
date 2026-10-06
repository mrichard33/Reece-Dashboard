"use client";

import { cn } from "@/lib/utils";
import type { Issue } from "@/lib/botReview/conversation";

/**
 * "Why this is here" — the top of the middle column (2026-10-06).
 *
 * The text is built by code (buildWhyText), never by a model (AI OS
 * CANON.P.001: code decides). Each issue chip is a button that brings its
 * message into view, so the reviewer reads the problem before the thread.
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
  function jump(anchor: string) {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

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
          <div className="mt-1 flex flex-wrap gap-1">
            {issues.map((x, i) => (
              <button
                key={`${x.anchor}-${x.label}-${i}`}
                type="button"
                onClick={() => jump(x.anchor)}
                className={cn(
                  "rounded-full px-2 py-1 text-[11px] font-semibold underline-offset-2 hover:underline",
                  x.tone === "rose"
                    ? "bg-rose-700 text-white dark:bg-rose-600"
                    : "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
