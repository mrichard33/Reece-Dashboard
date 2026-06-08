"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  format,
} from "date-fns";
import { Drawer } from "@/components/ui/Drawer";
import { PostReview } from "@/components/content/PostReview";
import { pillarLabel } from "@/components/content/meta";
import { cn } from "@/lib/utils";
import type { FbPost, FbPostStatus } from "@/lib/supabase/types";

const DOT: Record<FbPostStatus, string> = {
  draft: "bg-navy-600",
  approved: "bg-emerald-500",
  posted: "bg-slate-400",
  skipped: "bg-slate-300",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Calendar({
  posts,
  year,
  monthIndex,
  isExecutive,
  initialNeedsOnly,
}: {
  posts: FbPost[];
  year: number;
  monthIndex: number;
  isExecutive: boolean;
  initialNeedsOnly: boolean;
}) {
  const [needsOnly, setNeedsOnly] = useState(initialNeedsOnly);
  // Track the selection by id (not a post snapshot) so the drawer re-derives from
  // the freshly-refetched `posts` after a server action + router.refresh(). Holding
  // the whole object would keep rendering stale data and make actions look dead.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? posts.find((p) => p.id === selectedId) ?? null : null;

  const first = new Date(year, monthIndex, 1);
  const gridStart = startOfWeek(startOfMonth(first), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDate = new Map<string, FbPost[]>();
  for (const p of posts) {
    if (needsOnly && p.status !== "draft") continue;
    const arr = byDate.get(p.scheduled_date) ?? [];
    arr.push(p);
    byDate.set(p.scheduled_date, arr);
  }

  const prev = format(addMonths(first, -1), "yyyy-MM");
  const next = format(addMonths(first, 1), "yyyy-MM");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/content?month=${prev}`}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            {format(first, "MMMM yyyy")}
          </h2>
          <Link
            href={`/content?month=${next}`}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={needsOnly}
              onChange={(e) => setNeedsOnly(e.target.checked)}
            />
            Needs approval only
          </label>
          <Legend />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-sm dark:border-slate-800 dark:bg-slate-800">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-slate-50 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400"
          >
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const inMonth = d.getMonth() === monthIndex;
          const cellPosts = byDate.get(key) ?? [];
          return (
            <div
              key={key}
              className={cn(
                "min-h-24 bg-white p-1.5 align-top dark:bg-slate-900",
                !inMonth && "bg-slate-50 text-slate-400 dark:bg-slate-950",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "text-[11px]",
                    key === todayStr &&
                      "rounded bg-brick px-1.5 py-0.5 font-semibold text-white",
                  )}
                >
                  {format(d, "d")}
                </span>
              </div>
              <div className="space-y-1">
                {cellPosts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:ring-1 hover:ring-navy-300",
                      p.needs_manual
                        ? "bg-amber-50 dark:bg-amber-950"
                        : "bg-slate-50 dark:bg-slate-800",
                    )}
                    title={p.pillar ? pillarLabel(p.pillar) : "Post"}
                  >
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", DOT[p.status])} />
                    <span className="truncate">{p.pillar ? pillarLabel(p.pillar) : "Post"}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected ? `Post · ${format(new Date(selected.scheduled_date + "T00:00:00"), "EEE, MMM d")}` : ""}
        subtitle="Review copy and image independently"
      >
        {selected && <PostReview post={selected} isExecutive={isExecutive} />}
      </Drawer>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500">
      {(["draft", "approved", "posted", "skipped"] as FbPostStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", DOT[s])} /> {s}
        </span>
      ))}
    </div>
  );
}
