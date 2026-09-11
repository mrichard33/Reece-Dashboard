"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { InfoPopover } from "@/components/help/InfoPopover";
import { LANES, SAVED_VIEWS, resolveLane } from "@/lib/botReview/core";
import type { LaneCounts } from "@/lib/botReview/core";

/**
 * Lane switcher + dropdown filters + active chips.
 *
 * Filters live in the URL, not in component state: the queue is server-rendered
 * and a reviewer needs to be able to send someone a link to what they are
 * looking at. Changing any control replaces the URL and drops `ctx` and `page`,
 * because the selected message and the page number almost never still apply
 * under a different filter.
 *
 * Increment 2 (§6A): the saved views lost the top-level position to the lane
 * switcher. They survive inside Everything, as ordinary filters — the questions
 * they answer ("show me the price objections") are still worth asking, they are
 * just not how the day's work gets chosen any more.
 */

const DROPDOWNS: Array<{ param: string; label: string; options: Array<[string, string]> }> = [
  { param: "date", label: "Date", options: [["all", "Any date"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"]] },
  { param: "channel", label: "Channel", options: [["all", "Any channel"], ["sms", "SMS"], ["email", "Email"], ["live_chat", "Live chat"]] },
  { param: "type", label: "Type", options: [["all", "Replies + nurture"], ["replies", "Replies"], ["nurture", "Nurture"], ["skipped", "Skipped"]] },
  { param: "outcome", label: "Outcome", options: [["all", "Any outcome"], ["booked", "Booked"], ["replied", "Replied"], ["no_reply", "No reply"], ["opted_out", "Opted out"]] },
  { param: "status", label: "Status", options: [["all", "All"], ["unreviewed", "Unreviewed"], ["flagged", "Flagged"]] },
];

export function FilterBar({
  rules,
  offices,
  laneCounts,
}: {
  rules: string[];
  offices: string[];
  laneCounts: LaneCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function set(param: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (!value || value === "all") next.delete(param);
    else next.set(param, value);
    // A different filter means a different queue — the old selection and page
    // are almost certainly not in it.
    next.delete("ctx");
    next.delete("page");
    router.push(`${pathname}?${next.toString()}` as Route);
  }

  const activeLane = resolveLane(sp.get("lane"));

  function clearAll() {
    const next = new URLSearchParams();
    const tab = sp.get("tab");
    if (tab) next.set("tab", tab);
    // The lane is not a filter — it is which queue you are in. Clearing filters
    // must not eject a reviewer from the lane they are working.
    const lane = sp.get("lane");
    if (lane) next.set("lane", lane);
    router.push(`${pathname}?${next.toString()}` as Route);
  }

  const activeView = sp.get("view") ?? "riskiest";
  const chips: Array<{ param: string; label: string }> = [];
  for (const d of DROPDOWNS) {
    const v = sp.get(d.param);
    if (v) chips.push({ param: d.param, label: d.options.find(([k]) => k === v)?.[1] ?? v });
  }
  for (const p of ["rule", "office"]) {
    const v = sp.get(p);
    if (v) chips.push({ param: p, label: v });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The lane switcher takes the segmented control's old position, because
          it is now the first decision a reviewer makes: what am I working on. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {LANES.map((l) => {
          const count = laneCounts[l.key];
          const on = activeLane === l.key;
          return (
            <span key={l.key} className="flex items-center">
              <button
                type="button"
                onClick={() => set("lane", l.key)}
                aria-current={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                  on
                    ? "bg-white text-navy-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-navy-800 dark:text-slate-300 dark:hover:text-white",
                )}
              >
                {l.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px font-mono text-[10px]",
                    on
                      ? "bg-navy-100 text-navy-800 dark:bg-navy-900 dark:text-navy-100"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
                  )}
                >
                  {count}
                </span>
              </button>
              <InfoPopover helpKey={`botReview.lane.${l.key}`} />
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* The saved views are Everything's filters now. Showing them in the
            work lanes would offer a filter that fights the lane it sits in. */}
        {activeLane === "everything" && (
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {SAVED_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => set("view", v.key === "riskiest" ? "all" : v.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  activeView === v.key
                    ? "bg-white text-navy-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-navy-800 dark:text-slate-300 dark:hover:text-white",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {DROPDOWNS.map((d) => (
          <select
            key={d.param}
            aria-label={d.label}
            value={sp.get(d.param) ?? "all"}
            onChange={(e) => set(d.param, e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {d.options.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        ))}

        {rules.length > 0 && (
          <select
            aria-label="Rule or workflow"
            value={sp.get("rule") ?? "all"}
            onChange={(e) => set("rule", e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Any rule</option>
            {rules.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}

        {offices.length > 0 && (
          <select
            aria-label="Office"
            value={sp.get("office") ?? "all"}
            onChange={(e) => set("office", e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All offices</option>
            {offices.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Active filters</span>
          {chips.map((c) => (
            <button
              key={c.param}
              type="button"
              onClick={() => set(c.param, "all")}
              className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-800 ring-1 ring-navy-200 hover:ring-navy-400 dark:bg-navy-900 dark:text-navy-100 dark:ring-navy-700"
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-[11px] font-medium text-navy-700 hover:underline dark:text-navy-200">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
