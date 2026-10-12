"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Monthly / Weekly toggle for the Lead Cost tab, carried in `?grain=`.
 * Weekly spreads monthly invoices across weeks by days and shows no
 * Net / Working $ (report 133 is monthly). Same segment styling as
 * components/scorecard/tiers/ViewSelector.tsx, taller on phones (h-8).
 */
export function CostGrainToggle({ active }: { active: "month" | "week" }) {
  const router = useRouter();
  const params = useSearchParams();
  function pick(key: "month" | "week") {
    const next = new URLSearchParams(params.toString());
    if (key === "month") next.delete("grain");
    else next.set("grain", key);
    router.replace(`?${next.toString()}`);
  }
  const opts: { key: "month" | "week"; label: string }[] = [{ key: "month", label: "Monthly" }, { key: "week", label: "Weekly" }];
  return (
    <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950" role="group" aria-label="Lead cost grain">
      {opts.map((o) => {
        const on = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            aria-pressed={on}
            className={`h-8 rounded px-2.5 text-[12px] font-medium transition sm:h-7 ${on ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
