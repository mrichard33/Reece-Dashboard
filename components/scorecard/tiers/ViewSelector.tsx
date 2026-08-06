"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CADENCES, type CadenceKey } from "@/lib/scorecard/tiers/cadence";

/**
 * Daily / Weekly / Monthly selector.
 *
 * The active cadence is carried in `?view=`; with no param the page picks the
 * signed-in role's default (executives → Monthly, operators → Weekly). Picking
 * one explicitly pins it, so a default never fights a deliberate choice.
 */
export function ViewSelector({
  active,
  fromRole,
}: {
  active: CadenceKey;
  fromRole: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function pick(key: CadenceKey) {
    const next = new URLSearchParams(params.toString());
    next.set("view", key);
    router.replace(`?${next.toString()}`);
  }

  return (
    <div
      className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950"
      role="group"
      aria-label="Scorecard cadence"
      title={
        fromRole
          ? "Defaulted to your role — pick one to pin it."
          : undefined
      }
    >
      {CADENCES.map((c) => {
        const on = c.key === active;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => pick(c.key)}
            aria-pressed={on}
            title={`${c.audience} — ${c.blurb}`}
            className={`h-7 rounded px-2.5 text-[12px] font-medium transition ${
              on
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
