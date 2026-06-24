"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown } from "lucide-react";

/**
 * Period filter, restyled to the redesign's navy segmented pill control. Writes
 * ?period=…(&start=&end=) to the URL; the server page resolves it
 * (lib/date/resolvePeriod) and re-sources the data. Custom opens a From/To popover.
 *
 * Day → today · Week → week · Month → month (MTD, default) · 3 months → qtd ·
 * YTD → ytd · Custom → custom.
 */
const SEGMENTS: { key: string; label: string }[] = [
  { key: "today", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "qtd", label: "3 months" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

export function PeriodPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("period") || "month";
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(params.get("start") || "");
  const [end, setEnd] = useState(params.get("end") || "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function go(period: string, extra?: { start?: string; end?: string }) {
    const next = new URLSearchParams(params.toString());
    next.set("period", period);
    if (extra?.start) next.set("start", extra.start);
    else next.delete("start");
    if (extra?.end) next.set("end", extra.end);
    else next.delete("end");
    router.replace(`?${next.toString()}`);
  }

  function applyCustom() {
    if (start && end && start <= end) {
      go("custom", { start, end });
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <CalendarRange size={15} className="text-slate-400" />
      <div className="flex items-center rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
        {SEGMENTS.map((s) => {
          const on = active === s.key;
          return (
            <button
              key={s.key}
              onClick={() => {
                if (s.key === "custom") setOpen(true);
                else go(s.key);
              }}
              className={`h-7 whitespace-nowrap rounded px-3 text-[12px] font-medium transition ${
                on
                  ? "bg-[#0C2340] text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {active === "custom" && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <span className="font-mono tabular">{start || "from"} – {end || "to"}</span>
            <ChevronDown size={14} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute right-0 z-40 mt-1.5 w-[300px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</span>
                  <input
                    type="date"
                    value={start}
                    max={end || undefined}
                    onChange={(e) => setStart(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-[12.5px] tabular text-slate-800 outline-none focus:ring-2 focus:ring-[#274560] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</span>
                  <input
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-[12.5px] tabular text-slate-800 outline-none focus:ring-2 focus:ring-[#274560] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
              </div>
              <div className="mt-2.5 flex justify-end">
                <button
                  onClick={applyCustom}
                  disabled={!start || !end || start > end}
                  className="inline-flex h-8 items-center rounded-md bg-[#0C2340] px-3 text-[12px] font-medium text-white transition hover:bg-[#122739] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply range
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
