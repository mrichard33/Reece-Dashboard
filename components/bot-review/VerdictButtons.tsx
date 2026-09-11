"use client";

import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/botReview/core";

/**
 * The three verdict buttons — the first thing a reviewer touches and the only
 * required field. Large targets on purpose: the design budgets 30 seconds for a
 * whole review, and this is the click that has to be instant.
 *
 * Keyboard hints are rendered inline (G / N / U) because the shortcut only
 * helps someone who knows it exists. The handler lives in ReviewPanel so one
 * listener covers the whole screen.
 */

const OPTIONS: Array<{ value: Verdict; label: string; key: string; icon: string; on: string; ring: string }> = [
  {
    value: "good",
    label: "Good",
    key: "G",
    icon: "👍",
    on: "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700",
    ring: "hover:ring-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300",
  },
  {
    value: "needs_work",
    label: "Needs work",
    key: "N",
    icon: "👎",
    on: "bg-amber-500 text-white ring-amber-500 hover:bg-amber-600",
    ring: "hover:ring-amber-400 hover:text-amber-700 dark:hover:text-amber-300",
  },
  {
    value: "unsafe",
    label: "Unsafe",
    key: "U",
    icon: "⚠️",
    on: "bg-rose-600 text-white ring-rose-600 hover:bg-rose-700",
    ring: "hover:ring-rose-400 hover:text-rose-700 dark:hover:text-rose-300",
  },
];

export function VerdictButtons({
  value,
  onChange,
  disabled = false,
  showKeys = true,
}: {
  value: Verdict | null;
  onChange: (v: Verdict) => void;
  disabled?: boolean;
  showKeys?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How was this message?">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ring-1 transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500",
              disabled && "cursor-not-allowed opacity-60",
              selected
                ? o.on
                : cn(
                    "bg-white text-slate-700 ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700",
                    !disabled && o.ring,
                  ),
            )}
          >
            <span aria-hidden>{o.icon}</span>
            <span>{o.label}</span>
            {showKeys && (
              <span
                className={cn(
                  "text-[11px] font-normal",
                  selected ? "text-white/80" : "text-slate-400 dark:text-slate-500",
                )}
              >
                ({o.key})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
