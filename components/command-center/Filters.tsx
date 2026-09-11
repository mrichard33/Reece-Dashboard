"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Route } from "next";
import { useCallback } from "react";
import { CARD_TYPE_LABEL, type CardType } from "@/lib/commandCenter/rules";

const TYPES: CardType[] = [
  "decision_needed", "unconfirmed_decision", "open_question", "approval_needed", "conflict",
];

const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

/**
 * Queue filters, held in the URL rather than in component state — so a filtered
 * view can be bookmarked, shared, and survives the reload that follows a
 * stale_card. Changing any filter resets to page 1.
 */
export function Filters({ areas }: { areas: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      next.delete("page"); // a new filter is a new first page
      // typedRoutes is on; a query string built at runtime is not a route
      // literal, so the cast is the documented escape hatch.
      router.push(`${pathname}?${next.toString()}` as Route);
    },
    [params, pathname, router],
  );

  const area = params.get("area") ?? "";
  const type = params.get("type") ?? "";
  const omiOnly = params.get("omi") === "1";
  const highOnly = params.get("high") === "1";
  const anyActive = area || type || omiOnly || highOnly;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Area
        <select className={selectClass} value={area} onChange={(e) => set("area", e.target.value)}>
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Type
        <select className={selectClass} value={type} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>{CARD_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="rounded border-slate-300 dark:border-slate-600"
          checked={omiOnly}
          onChange={(e) => set("omi", e.target.checked ? "1" : null)}
        />
        Heard on Omi only
      </label>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="rounded border-slate-300 dark:border-slate-600"
          checked={highOnly}
          onChange={(e) => set("high", e.target.checked ? "1" : null)}
        />
        High confidence only
      </label>

      {anyActive ? (
        <button
          type="button"
          className="text-xs text-navy-700 underline hover:text-navy-900 dark:text-slate-300 dark:hover:text-slate-100"
          onClick={() => router.push(pathname as Route)}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
