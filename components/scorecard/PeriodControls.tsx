"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Period filter for the scorecard. Writes ?period=…(&start=&end=) to the URL; the
 * server page resolves it (lib/date/resolvePeriod) and re-sources the data. Active
 * key is read back from the URL so the buttons reflect the current view.
 *
 * Day → today · Week → week · Month → month (MTD, default) · 3 months → qtd ·
 * YTD → ytd · Custom → custom (date-range inputs writing start/end).
 */
const BUTTONS: { key: string; label: string }[] = [
  { key: "today", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "qtd", label: "3 months" },
  { key: "ytd", label: "YTD" },
];

export function PeriodControls() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("period") || "month";
  const [showCustom, setShowCustom] = useState(active === "custom");
  const [start, setStart] = useState(params.get("start") || "");
  const [end, setEnd] = useState(params.get("end") || "");

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
    if (start && end && start <= end) go("custom", { start, end });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {BUTTONS.map((b) => (
        <Button
          key={b.key}
          size="sm"
          variant={active === b.key ? "primary" : "secondary"}
          onClick={() => {
            setShowCustom(false);
            go(b.key);
          }}
        >
          {b.label}
        </Button>
      ))}
      <Button
        size="sm"
        variant={active === "custom" ? "primary" : "secondary"}
        onClick={() => setShowCustom((v) => !v)}
      >
        Custom
      </Button>

      {showCustom ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            aria-label="Custom range start"
          />
          <span className="text-xs text-slate-500">→</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            aria-label="Custom range end"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!start || !end || start > end}
            onClick={applyCustom}
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
