"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Period selector for the scorecard. A presentational segmented control plus a
 * Custom-range popover; both write the selection to the URL (?period / ?start /
 * ?end) so the page stays a server component that re-aggregates from the cache.
 */

const PRESETS: Array<{ value: string; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "q", label: "3 Months" },
  { value: "ytd", label: "YTD" },
];

export function PeriodPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("period") ?? "month";

  const [customOpen, setCustomOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = format(new Date(), "yyyy-MM-dd");
  const [start, setStart] = useState(params.get("start") ?? today);
  const [end, setEnd] = useState(params.get("end") ?? today);
  const invalid = start > end;

  useEffect(() => {
    if (!customOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setCustomOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setCustomOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [customOpen]);

  function selectPreset(value: string) {
    router.push(`/scorecard?period=${value}`);
  }

  function applyCustom() {
    if (invalid) return;
    router.push(`/scorecard?period=custom&start=${start}&end=${end}`);
    setCustomOpen(false);
  }

  return (
    <div className="no-print flex items-center gap-1.5">
      <div
        className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
        role="group"
        aria-label="Select period"
      >
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-current={active === p.value}
            onClick={() => selectPreset(p.value)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-navy-600",
              active === p.value
                ? "bg-white text-navy-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-500 hover:text-navy-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div ref={ref} className="relative">
        <button
          type="button"
          aria-current={active === "custom"}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-navy-600",
            active === "custom"
              ? "border-navy-600 bg-navy-50 text-navy-900 dark:border-navy-400 dark:bg-navy-900/40 dark:text-white"
              : "border-slate-200 bg-slate-50 text-slate-500 hover:text-navy-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
          )}
        >
          <Calendar className="h-3.5 w-3.5" strokeWidth={2.25} />
          Custom
        </button>

        {customOpen && (
          <div
            role="dialog"
            aria-label="Custom date range"
            className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Start
              <input
                type="date"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-navy-900 focus:border-navy-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              End
              <input
                type="date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-navy-900 focus:border-navy-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            {invalid && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                Start must be on or before end.
              </p>
            )}
            <button
              type="button"
              onClick={applyCustom}
              disabled={invalid}
              className="mt-3 w-full rounded-md bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-navy-600 dark:hover:bg-navy-500"
            >
              Apply range
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
