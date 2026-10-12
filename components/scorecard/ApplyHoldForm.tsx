"use client";

import { useState, useTransition } from "react";
import { applyHoldRecommendation } from "@/lib/actions/marketingCost";
import { usdExact } from "@/lib/utils";

/**
 * "Apply recommendation" for held (REECE_HOLD) spend. Admin only; the money
 * never moves on its own (handoff D4). One click rewrites the expense's
 * markets to the recommended ones in LP-MCP and reallocates.
 */
export function ApplyHoldForm({
  held,
}: {
  held: { id: string; description: string; amount: number; recommended_market: string | null; recommendation_reason: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Record<string, string>>({});
  const applicable = held.filter((h) => h.recommended_market);
  if (!applicable.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {applicable.map((h) => (
        <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
          <span className="min-w-0 break-words text-slate-600 dark:text-slate-300">
            {usdExact(h.amount)} · {h.description} → <strong>{h.recommended_market}</strong>
            <span className="text-slate-400"> ({h.recommendation_reason})</span>
          </span>
          {result[h.id] ? (
            <span className="text-emerald-600 dark:text-emerald-400">{result[h.id]}</span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => {
                const r = await applyHoldRecommendation(h.id, (h.recommended_market ?? "").split(","));
                setResult((s) => ({ ...s, [h.id]: r.ok ? "Applied — reallocated" : `Not applied: ${r.error}` }));
              })}
              className="inline-flex h-8 items-center rounded-md bg-[#0C2340] px-3 text-[12px] font-medium text-white hover:bg-[#143560] disabled:opacity-50 sm:h-7"
            >
              Apply recommendation
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
