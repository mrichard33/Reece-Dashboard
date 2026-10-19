"use client";

import { useState, useTransition } from "react";
import { applyHoldRecommendation } from "@/lib/actions/marketingCost";
import { usdExact } from "@/lib/utils";
import { marketLabel } from "@/lib/scorecard/markets";
import { plainHoldDescription, plainHoldReason } from "@/lib/queries/marketingSpend.core";

export type HeldItem = { id: string; description: string; amount: number; recommended_market: string | null; recommendation_reason: string | null };

/**
 * Held spend (REECE_HOLD) and its recommendation, in plain words. Moved here
 * from Scorecard › Sources on 2026-10-19 (the user: the scorecard is for
 * sales). The money never moves on its own (handoff D4, kept by the user the
 * same day): an admin clicks "Apply recommendation". $0 rows (a gap a later
 * feed pull closed) are never listed (getHeldExpenses).
 */
export function HeldSpend({ held, canApply }: { held: HeldItem[]; canApply: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Record<string, string>>({});
  if (!held.length) {
    return <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Nothing is held at company level in this period.</p>;
  }
  return (
    <div className="space-y-2">
      {held.map((h) => (
        <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-[13px] dark:border-slate-800">
          <div className="w-full min-w-0 space-y-0.5 sm:w-auto sm:flex-1">
            <div className="break-words text-slate-800 dark:text-slate-100">
              <span className="font-mono font-semibold tabular">{usdExact(h.amount)}</span> · {plainHoldDescription(h.description)}
            </div>
            <div className="break-words text-xs text-slate-500 dark:text-slate-400">{plainHoldReason(h.recommended_market, h.recommendation_reason, marketLabel)}</div>
          </div>
          {result[h.id] ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{result[h.id]}</span>
          ) : canApply && h.recommended_market ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => {
                const r = await applyHoldRecommendation(h.id, (h.recommended_market ?? "").split(","));
                setResult((s) => ({ ...s, [h.id]: r.ok ? "Applied, moved to the office" : `Not applied: ${r.error}` }));
              })}
              className="inline-flex h-8 shrink-0 items-center rounded-md bg-[#0C2340] px-3 text-[12px] font-medium text-white hover:bg-[#143560] disabled:opacity-50 sm:h-7"
            >
              Apply recommendation
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
