"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronDown, Check } from "lucide-react";
import { SCORECARD_MARKETS, marketLabel } from "@/lib/scorecard/markets";

/**
 * Market scope picker. "All Markets" is the REECE company roll-up (no `market`
 * param); picking a market sets `?market=<code>` and the whole scorecard re-sources
 * for that market. The 7 markets map to the per-market snapshot rows written by
 * the LP-MCP per-market writer. SCORECARD_MARKETS / marketLabel now live in
 * lib/scorecard/markets so the server page can call marketLabel too.
 */

export function MarketPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("market") || "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(code: string) {
    const next = new URLSearchParams(params.toString());
    if (code) next.set("market", code);
    else next.delete("market");
    router.replace(`?${next.toString()}`);
    setOpen(false);
  }

  const rows: { code: string; label: string }[] = [
    { code: "", label: "All Markets" },
    ...SCORECARD_MARKETS.map((m) => ({ code: m.code, label: m.label })),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
      >
        <Building2 size={13} className="text-slate-400" />
        <span>{marketLabel(active)}</span>
        <ChevronDown size={13} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {rows.map((r) => {
            const on = (r.code || "") === active;
            return (
              <button
                key={r.code || "all"}
                role="option"
                aria-selected={on}
                onClick={() => pick(r.code)}
                className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[12.5px] transition ${
                  on
                    ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                } ${r.code === "" ? "border-b border-slate-100 dark:border-slate-800" : ""}`}
              >
                <span>{r.label}</span>
                {on && <Check size={13} className="text-[#0C2340] dark:text-slate-100" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
