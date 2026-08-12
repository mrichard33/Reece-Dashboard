"use client";

import { useState, useRef, useEffect } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHelp } from "./helpContent";

/**
 * The (i) button used on every tile and section. Click to toggle a popover
 * showing { what, where, fix }. Click outside or press Esc to close.
 */
export function InfoPopover({
  helpKey,
  info,
  className,
  align = "right",
}: {
  /** Registry key (helpContent.ts). Omit when passing `info` inline. */
  helpKey?: string;
  /** Inline help, bypassing the registry — used by the scorecard section cards. */
  info?: { title?: string; what: string; where: string; fix: string };
  className?: string;
  align?: "left" | "right";
}) {
  const entry = info
    ? { title: info.title ?? "About this section", what: info.what, where: info.where, fix: info.fix }
    : helpKey
      ? getHelp(helpKey)
      : null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  if (!entry) {
    return (
      <span
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-800",
          className,
        )}
        title={`Missing help entry: ${helpKey}`}
      >
        ?
      </span>
    );
  }

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={`Info: ${entry.title}`}
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      {/*
        MOBILE: a viewport-anchored sheet, not a popover.

        The absolute popover below `sm` was unusable, for two independent
        reasons. (1) `w-80` is a fixed 320px hung off a 20px trigger, so on a
        ~390px screen it runs off whichever edge the trigger sits near —
        `align="left"` overflows the right edge almost everywhere. (2) An
        absolutely-positioned child CANNOT escape an ancestor with
        `overflow-x-auto`, and that describes every table on the scorecard
        (ByMarketTable, SourcePerformanceTable, the cohort table), so those ⓘ
        buttons opened into a clipped strip or nothing at all.

        `fixed` solves both at once: it is positioned against the viewport, so
        no scroll container can clip it and its width is bounded by the screen
        rather than by a constant. At `sm` and up the original popover is
        restored unchanged.
      */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 sm:hidden"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div
          className={cn(
            "fixed inset-x-4 bottom-4 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900",
            // ≥ sm: back to the anchored popover, exactly as before.
            "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:z-40 sm:mt-2 sm:max-h-none sm:w-80 sm:overflow-visible",
            align === "right" ? "sm:right-0" : "sm:left-0",
          )}
          role="dialog"
          aria-modal="false"
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-display text-sm font-semibold text-navy-900 dark:text-white">
              {entry.title}
            </h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="mt-3 space-y-3 text-xs">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                What
              </dt>
              <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                {entry.what}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Where
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                {entry.where}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Fix
              </dt>
              <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                {entry.fix}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
