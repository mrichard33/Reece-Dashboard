"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHelp } from "./helpContent";

/** Panel width at ≥ sm, in px. Mirrors the former `w-80`. */
const PANEL_WIDTH = 320;
/** Gap between trigger and panel, and the minimum inset from the viewport. */
const GAP = 8;
/** Below this much room underneath the trigger, prefer flipping above it. */
const MIN_ROOM_BELOW = 220;

/**
 * Where the panel sits, in viewport coordinates. Anchored by `top` (opening
 * downward) or by `bottom` (flipped up), never both. `null` = the mobile sheet,
 * which is pure CSS and needs no measurement.
 */
type Placement = { left: number; width: number; maxHeight: number } & (
  | { top: number; bottom?: never }
  | { bottom: number; top?: never }
);

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
  const [placement, setPlacement] = useState<Placement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  /*
    THE PANEL IS POSITIONED AGAINST THE VIEWPORT AT EVERY BREAKPOINT.

    An absolutely-positioned child CANNOT escape an ancestor that clips —
    `overflow-hidden` or `overflow-x-auto` — and the scorecard is built out of
    exactly those ancestors:

      · RevenueCard's SplitCard      overflow-hidden   ← Sold / Released /
                                                         Lost / Open backlog
      · ByMarketTable                hidden overflow-x-auto lg:block
      · SourcePerformanceTable       hidden overflow-x-auto sm:block
      · LeadCostTable                hidden overflow-x-auto lg:block

    The first round of this fix made the panel `fixed` below `sm` only and
    restored `sm:absolute` above it. That moved the bug rather than removing
    it: the three tables above are DESKTOP-ONLY scroll containers, and
    SplitCard clips at every width, so the ⓘ then opened clipped on desktop —
    "contained in the box" — while reading fine on a phone.

    `fixed` cannot be clipped by any ancestor, so it is now the only mode.
    What `absolute` gave for free — following the trigger — is recovered by
    measuring the button and repositioning on scroll and resize. The panel is
    still a DOM descendant of this component, so click-outside still works.
  */
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;

    // Below `sm` the panel is a viewport-anchored sheet: full-width, pinned to
    // the bottom, no measurement possible or wanted.
    if (!window.matchMedia("(min-width: 640px)").matches) {
      setPlacement(null);
      return;
    }

    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Never wider than the viewport allows, and never hanging off either edge —
    // `align` sets the preferred edge, the clamp keeps it on screen regardless.
    const width = Math.min(PANEL_WIDTH, vw - GAP * 2);
    const preferred = align === "right" ? r.right - width : r.left;
    const left = Math.min(Math.max(GAP, preferred), vw - width - GAP);

    const roomBelow = vh - r.bottom - GAP * 2;
    const roomAbove = r.top - GAP * 2;

    setPlacement(
      roomBelow >= MIN_ROOM_BELOW || roomBelow >= roomAbove
        ? { left, width, top: r.bottom + GAP, maxHeight: roomBelow }
        : { left, width, bottom: vh - r.top + GAP, maxHeight: roomAbove },
    );
  }, [align]);

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
    // Capture phase: a scrolling ANCESTOR (those tables) must reposition the
    // panel too, and scroll events on a container do not bubble to window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

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
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Measure BEFORE opening so the panel's first paint is already in the
          // right place — no frame at (0,0) and no visible jump.
          if (!open) place();
          setOpen((o) => !o);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={`Info: ${entry.title}`}
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      {/* Tap-to-close scrim, phone only — the desktop panel closes on outside click. */}
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
            "fixed z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900",
            // No measurement (below sm): the viewport sheet.
            placement ? "" : "inset-x-4 bottom-4 max-h-[70vh]",
          )}
          style={
            placement
              ? {
                  left: placement.left,
                  width: placement.width,
                  maxHeight: placement.maxHeight,
                  ...(placement.top !== undefined
                    ? { top: placement.top }
                    : { bottom: placement.bottom }),
                }
              : undefined
          }
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
