"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { GoalEditor } from "./GoalEditor";
import { GoalDistributor } from "./GoalDistributor";
import type { ScorecardGoalsEditorData } from "@/lib/queries/scorecard";

/**
 * Admin "Edit goals" control. A compact header button that opens the per-market /
 * per-month GoalEditor in a modal overlay, so the button can live in the page
 * controls while the editor floats above the scorecard. `initialMarket` seeds the
 * editor's Market selector from the currently viewed scope.
 */
export function EditGoalsPanel({
  data,
  initialMarket,
}: {
  data: ScorecardGoalsEditorData;
  initialMarket?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
      >
        <SlidersHorizontal size={13} />
        Edit goals
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative w-full max-w-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute -top-2 right-0 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="space-y-4">
              <GoalDistributor data={data} />
              <GoalEditor data={data} initialMarket={initialMarket} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
