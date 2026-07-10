"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown, Check } from "lucide-react";

/**
 * Period filter (v3). Navy segmented pill with four choices — MTD (default) ·
 * 3 Months · YTD · Month ▾. Writes ?period=… (and ?start=YYYY-MM for a picked
 * month) to the URL; the server page resolves it (lib/date/resolvePeriod) and
 * re-sources the data.
 *
 *   MTD       → month        (stored MTD snapshot)
 *   3 Months  → trailing_3m  (current + 2 prior full months, aggregate)
 *   YTD       → ytd          (Jan 1 → today, aggregate)
 *   Month ▾   → select_month (a past completed month's stored EOM snapshot)
 *
 * Day / Week / Custom range and the live recompute path are intentionally gone —
 * this page reads snapshots/aggregates only.
 */

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SEGMENTS: { key: string; label: string }[] = [
  { key: "month", label: "MTD" },
  { key: "trailing_3m", label: "3 Months" },
  { key: "ytd", label: "YTD" },
];

/** Trailing completed months (newest first): the 12 months before this month. */
function completedMonths(): { ym: string; label: string }[] {
  const now = new Date();
  const out: { ym: string; label: string }[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-based
    out.push({
      ym: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTHS_LONG[m]} ${y}`,
    });
  }
  return out;
}

export function PeriodPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("period") || "month";
  const selectedMonth = params.get("start") || "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const months = useMemo(completedMonths, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function go(period: string, start?: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", period);
    if (start) next.set("start", start);
    else next.delete("start");
    next.delete("end");
    router.replace(`?${next.toString()}`);
  }

  const monthActive = active === "select_month";
  const monthLabel = monthActive
    ? months.find((m) => m.ym === selectedMonth)?.label ?? "Month"
    : "Month";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <CalendarRange size={15} className="text-slate-400" />
      <div className="flex items-center rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
        {SEGMENTS.map((s) => {
          const on = active === s.key;
          return (
            <button
              key={s.key}
              onClick={() => go(s.key)}
              className={`h-8 whitespace-nowrap rounded px-3 text-[12px] font-medium transition sm:h-7 ${
                on
                  ? "bg-[#0C2340] text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {s.label}
            </button>
          );
        })}
        {/* Month ▾ — dropdown of past completed months */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded px-3 text-[12px] font-medium transition sm:h-7 ${
              monthActive
                ? "bg-[#0C2340] text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {monthLabel}
            <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div
              role="listbox"
              className="absolute right-0 z-40 mt-1.5 max-h-72 w-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {months.map((m) => {
                const on = monthActive && selectedMonth === m.ym;
                return (
                  <button
                    key={m.ym}
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      go("select_month", m.ym);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[12.5px] transition ${
                      on
                        ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <span className="tabular">{m.label}</span>
                    {on && <Check size={13} className="text-[#0C2340] dark:text-slate-100" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
