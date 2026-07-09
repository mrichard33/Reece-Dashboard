"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { GoalEditor } from "./GoalEditor";
import type { ScorecardGoals } from "@/lib/queries/scorecard";

/**
 * Admin "Edit goals" control. A compact header button that opens the GoalEditor
 * in a modal overlay, so the button can live in the page controls while the
 * editor floats above the scorecard. Phase 1 keeps the single-REECE editor;
 * per-market / per-month selectors arrive in a later phase.
 */
export function EditGoalsPanel({
  goals,
  baselineNetSales,
}: {
  goals: ScorecardGoals;
  baselineNetSales: number | null;
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
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
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
              className="absolute -top-2 right-0 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
            >
              <X size={16} />
            </button>
            <GoalEditor goals={goals} baselineNetSales={baselineNetSales} />
          </div>
        </div>
      )}
    </>
  );
}
