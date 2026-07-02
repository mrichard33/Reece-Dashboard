"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";
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
import { PlanReview } from "@/components/content/PlanReview";
import { PlanControls } from "@/components/content/PlanControls";
import { GeneratePostButton } from "@/components/content/GeneratePostButton";
import { pillarLabel } from "@/components/content/meta";
import { cn } from "@/lib/utils";
import type { FbPost, FbContentPlan, FbPostStatus } from "@/lib/supabase/types";

/**
 * Status progression: approved = yellow (queued, waiting), published to
 * Facebook = green. 'posted' (both legs done) shares the green; a target='both'
 * post whose Page leg is live but Group leg pending is detected via
 * page_posted_at (see dotFor) since its status is still 'approved'.
 */
const DOT: Record<FbPostStatus, string> = {
  draft: "bg-navy-600",
  approved: "bg-amber-400",
  posted: "bg-emerald-500",
  skipped: "bg-slate-300",
};

/** Page-leg-aware dot: page_posted_at flips an 'approved' post to green. */
function dotFor(p: FbPost): string {
  if (p.status === "approved" && p.page_posted_at) return DOT.posted;
  return DOT[p.status];
}

/** Page-leg-aware status text for the mobile agenda. */
function statusTextFor(p: FbPost): string {
  if (p.status === "approved" && p.page_posted_at) return "page posted";
  return p.status;
}

/** Brief-status dot on a planned slot (draft = amber, approved = emerald). */
function briefDot(status: FbContentPlan["brief_status"]): string | null {
  if (status === "approved") return "bg-emerald-500";
  if (status === "draft") return "bg-amber-400";
  return null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Selection = { kind: "post" | "plan"; id: string };

export function Calendar({
  posts,
  plan,
  year,
  monthIndex,
  isExecutive,
  initialNeedsOnly,
  planHorizonDays,
  maxPerGeneration,
  defaultPostTime,
}: {
  posts: FbPost[];
  plan: FbContentPlan[];
  year: number;
  monthIndex: number;
  isExecutive: boolean;
  initialNeedsOnly: boolean;
  planHorizonDays: number;
  maxPerGeneration: number;
  /** Settings default post time ("HH:MM" Eastern), or null = publish on approval. */
  defaultPostTime: string | null;
}) {
  const [needsOnly, setNeedsOnly] = useState(initialNeedsOnly);
  // Track the selection by id (not a snapshot) so the drawer re-derives from the
  // freshly-refetched props after a server action + router.refresh(). Holding the
  // whole object would keep rendering stale data and make actions look dead.
  const [sel, setSel] = useState<Selection | null>(null);
  const selectedPost = sel?.kind === "post" ? posts.find((p) => p.id === sel.id) ?? null : null;
  const selectedPlan = sel?.kind === "plan" ? plan.find((p) => p.id === sel.id) ?? null : null;
  const drawerOpen = selectedPost !== null || selectedPlan !== null;

  const first = new Date(year, monthIndex, 1);
  const gridStart = startOfWeek(startOfMonth(first), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDate = new Map<string, FbPost[]>();
  const postDates = new Set<string>();
  for (const p of posts) {
    postDates.add(p.scheduled_date);
    if (needsOnly && p.status !== "draft") continue;
    const arr = byDate.get(p.scheduled_date) ?? [];
    arr.push(p);
    byDate.set(p.scheduled_date, arr);
  }

  // Planned slots: only surface ones still 'planned' with no post on that day (a
  // 'generated' slot already shows as its post). Hidden under the needs-approval filter.
  const planByDate = new Map<string, FbContentPlan>();
  if (!needsOnly) {
    for (const s of plan) {
      if (s.status !== "planned" || postDates.has(s.plan_date)) continue;
      planByDate.set(s.plan_date, s);
    }
  }

  const prev = format(addMonths(first, -1), "yyyy-MM");
  const next = format(addMonths(first, 1), "yyyy-MM");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const hasUpcomingDraft = posts.some(
    (p) => p.status === "draft" && p.scheduled_date >= todayStr,
  );

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

        <div className="flex flex-wrap items-center gap-3">
          {isExecutive && <GeneratePostButton />}
          {isExecutive && (
            <PlanControls planHorizonDays={planHorizonDays} maxPerGeneration={maxPerGeneration} />
          )}
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

      {/* How generation works — one-line model explainer. */}
      {isExecutive && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          A draft is generated automatically each night. Use{" "}
          <span className="font-medium text-slate-600 dark:text-slate-300">Generate post</span> to
          add one on demand for a chosen date.
        </p>
      )}

      {/* Empty state — no upcoming drafts to review. */}
      {!hasUpcomingDraft && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          No drafts yet — posts generate automatically each night, or
          {isExecutive ? " click " : " an executive can click "}
          <span className="font-medium text-slate-600 dark:text-slate-300">Generate post</span> to
          create one now.
        </div>
      )}

      {/* Month grid — md+ only. */}
      <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-sm md:grid dark:border-slate-800 dark:bg-slate-800">
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
          const planSlot = planByDate.get(key);
          const planBriefDot = planSlot ? briefDot(planSlot.brief_status) : null;
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
                    onClick={() => setSel({ kind: "post", id: p.id })}
                    className={cn(
                      "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:ring-1 hover:ring-navy-300",
                      p.needs_manual
                        ? "bg-amber-50 dark:bg-amber-950"
                        : "bg-slate-50 dark:bg-slate-800",
                    )}
                    title={p.pillar ? pillarLabel(p.pillar) : "Post"}
                  >
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", dotFor(p))} />
                    {p.media_type === "video" && (
                      <Video className="h-3 w-3 flex-shrink-0 text-sky-500" />
                    )}
                    <span className="truncate">{p.pillar ? pillarLabel(p.pillar) : "Post"}</span>
                  </button>
                ))}
                {planSlot && (
                  <button
                    type="button"
                    onClick={() => setSel({ kind: "plan", id: planSlot.id })}
                    className="flex w-full items-center gap-1 truncate rounded border border-dashed border-sky-300 px-1 py-0.5 text-left text-[11px] text-slate-500 hover:ring-1 hover:ring-sky-300 dark:border-sky-800"
                    title={`Planned · ${pillarLabel(planSlot.pillar)}${
                      planSlot.brief_status !== "none" ? ` · brief ${planSlot.brief_status}` : ""
                    }`}
                  >
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-400" />
                    <span className="truncate">{pillarLabel(planSlot.pillar)}</span>
                    {planBriefDot && (
                      <span
                        className={cn("ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full", planBriefDot)}
                      />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agenda — mobile only. Stacks the month's scheduled days as cards. */}
      <div className="space-y-2 md:hidden">
        {(() => {
          const agenda = days
            .filter((d) => d.getMonth() === monthIndex)
            .map((d) => {
              const key = format(d, "yyyy-MM-dd");
              return { d, key, cellPosts: byDate.get(key) ?? [], planSlot: planByDate.get(key) };
            })
            .filter((e) => e.cellPosts.length > 0 || e.planSlot);

          if (agenda.length === 0) {
            return (
              <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
                Nothing scheduled this month.
              </p>
            );
          }

          return agenda.map(({ d, key, cellPosts, planSlot }) => (
            <div
              key={key}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs font-medium text-slate-600 dark:text-slate-300",
                    key === todayStr && "rounded bg-brick px-1.5 py-0.5 text-white",
                  )}
                >
                  {format(d, "EEE, MMM d")}
                </span>
              </div>
              <div className="space-y-1.5">
                {cellPosts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSel({ kind: "post", id: p.id })}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:ring-1 hover:ring-navy-300",
                      p.needs_manual
                        ? "bg-amber-50 dark:bg-amber-950"
                        : "bg-slate-50 dark:bg-slate-800",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", dotFor(p))} />
                    {p.media_type === "video" && (
                      <Video className="h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
                    )}
                    <span className="truncate">{p.pillar ? pillarLabel(p.pillar) : "Post"}</span>
                    <span className="ml-auto text-xs capitalize text-slate-400">
                      {statusTextFor(p)}
                    </span>
                  </button>
                ))}
                {planSlot && (
                  <button
                    type="button"
                    onClick={() => setSel({ kind: "plan", id: planSlot.id })}
                    className="flex w-full items-center gap-2 rounded border border-dashed border-sky-300 px-2 py-2 text-left text-sm text-slate-500 hover:ring-1 hover:ring-sky-300 dark:border-sky-800"
                  >
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-sky-400" />
                    <span className="truncate">{pillarLabel(planSlot.pillar)}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {planSlot.brief_status !== "none" ? `brief ${planSlot.brief_status}` : "planned"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ));
        })()}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setSel(null)}
        title={
          selectedPost
            ? `Post · ${format(new Date(selectedPost.scheduled_date + "T00:00:00"), "EEE, MMM d")}`
            : selectedPlan
              ? `Planned · ${format(new Date(selectedPlan.plan_date + "T00:00:00"), "EEE, MMM d")}`
              : ""
        }
        subtitle={selectedPost ? "Review copy and image independently" : "Planned slot — not generated yet"}
      >
        {selectedPost && (
          <PostReview
            post={selectedPost}
            isExecutive={isExecutive}
            defaultPostTime={defaultPostTime}
          />
        )}
        {selectedPlan && <PlanReview slot={selectedPlan} isExecutive={isExecutive} />}
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
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-sky-400" /> planned
      </span>
    </div>
  );
}
