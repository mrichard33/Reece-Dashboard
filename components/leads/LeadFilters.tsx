"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Search, X } from "lucide-react";
import type { LeadFilterOptions, LeadsFilters } from "@/lib/queries/leadsList.core";
import { humanizeTagValue } from "@/lib/journey/tags";
import { cn } from "@/lib/utils";

/** Push a new query string, always dropping the paging cursor. */
function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (mutate: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("cursorDate");
    sp.delete("cursorId");
    mutate(sp);
    const qs = sp.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  };
}

/**
 * One box: name, phone (any format), email, GHL contact id, LP Prospect id or
 * LP lead id. A search ignores the filter chips — it answers "where is this
 * person", not "who matches these conditions".
 */
export function LeadSearch({ initial }: { initial: string | null }) {
  const [q, setQ] = useState(initial ?? "");
  const nav = useQueryNav();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        nav((sp) => (q.trim() ? sp.set("q", q.trim()) : sp.delete("q")));
      }}
      className="flex w-full max-w-xl items-center gap-2"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, phone, email, GHL id, Prospect # or LP lead #"
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              nav((sp) => sp.delete("q"));
            }}
            className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="submit"
        className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700 dark:bg-navy-700"
      >
        Search
      </button>
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition",
        active
          ? "bg-navy-800 text-white ring-navy-800 dark:bg-navy-600 dark:ring-navy-600"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}

const selectCls =
  "max-w-[14rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

export function LeadFilters({
  options,
  filters,
  view,
}: {
  options: LeadFilterOptions;
  filters: LeadsFilters;
  view: string | null;
}) {
  const nav = useQueryNav();
  const params = useSearchParams();

  const toggleOne = (key: string, value: string) =>
    nav((sp) => {
      sp.delete("view");
      if (sp.get(key) === value) sp.delete(key);
      else sp.set(key, value);
    });
  // Repeated params, not comma-joined — sources contain commas.
  const addToList = (key: string, value: string) =>
    nav((sp) => {
      if (!sp.getAll(key).includes(value)) sp.append(key, value);
    });
  const removeFromList = (key: string, value: string) =>
    nav((sp) => {
      const keep = sp.getAll(key).filter((v) => v !== value);
      sp.delete(key);
      for (const v of keep) sp.append(key, v);
    });

  const pipeline = options.pipelines.find((p) => p.id === filters.pipeline);
  const anyActive = [...params.keys()].some((k) => k !== "q");

  const multi: { key: string; label: string; values: string[]; render?: (v: string) => string }[] = [
    { key: "source", label: "Source", values: filters.source },
    { key: "lane", label: "Lane", values: filters.lane, render: humanizeTagValue },
    { key: "workflow", label: "Workflow", values: filters.workflow },
    { key: "lpRoute", label: "LP route", values: filters.lpRoute, render: humanizeTagValue },
  ];

  return (
    <div className="space-y-2">
      <Group label="Views">
        <Chip active={view === "new-today"} onClick={() => nav((sp) => (view === "new-today" ? sp.delete("view") : sp.set("view", "new-today")))}>
          New today
        </Chip>
        <Chip active={view === "stuck-7d"} onClick={() => nav((sp) => (view === "stuck-7d" ? sp.delete("view") : sp.set("view", "stuck-7d")))}>
          Stuck 7d+
        </Chip>
        <Chip
          active={view === "cancelled-week"}
          onClick={() => nav((sp) => (view === "cancelled-week" ? sp.delete("view") : sp.set("view", "cancelled-week")))}
        >
          Cancelled / no-show this week
        </Chip>
      </Group>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Group label="Entered">
          {(["today", "7d", "30d"] as const).map((v) => (
            <Chip key={v} active={filters.entered === v && !view} onClick={() => toggleOne("entered", v)}>
              {v === "today" ? "Today" : v}
            </Chip>
          ))}
          <input
            type="date"
            aria-label="Entered from"
            defaultValue={filters.from ?? ""}
            onChange={(e) => nav((sp) => (e.target.value ? sp.set("from", e.target.value) : sp.delete("from")))}
            className={selectCls}
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            aria-label="Entered to"
            defaultValue={filters.to ?? ""}
            onChange={(e) => nav((sp) => (e.target.value ? sp.set("to", e.target.value) : sp.delete("to")))}
            className={selectCls}
          />
        </Group>
        <Group label="Bot">
          {(["active", "stopped", "dnc", "none"] as const).map((v) => (
            <Chip key={v} active={filters.bot === v} onClick={() => toggleOne("bot", v)}>
              {v === "dnc" ? "DNC" : v[0]!.toUpperCase() + v.slice(1)}
            </Chip>
          ))}
        </Group>
        <Group label="Stuck">
          {([3, 7, 14] as const).map((v) => (
            <Chip key={v} active={filters.stuck === v && !view} onClick={() => toggleOne("stuck", String(v))}>
              {v}d+
            </Chip>
          ))}
        </Group>
        <Group label="Appt">
          <Chip active={filters.appt === "open" && !view} onClick={() => toggleOne("appt", "open")}>
            Upcoming
          </Chip>
          <Chip active={filters.appt === "missed" && !view} onClick={() => toggleOne("appt", "missed")}>
            Cancelled / no-show
          </Chip>
        </Group>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value="" onChange={(e) => e.target.value && addToList("source", e.target.value)}>
          <option value="">+ Source</option>
          {options.sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className={selectCls} value="" onChange={(e) => e.target.value && addToList("lane", e.target.value)}>
          <option value="">+ Lane</option>
          {options.lanes.map((s) => (
            <option key={s} value={s}>
              {humanizeTagValue(s)}
            </option>
          ))}
        </select>
        <select className={selectCls} value="" onChange={(e) => e.target.value && addToList("workflow", e.target.value)}>
          <option value="">+ Current workflow</option>
          {options.workflows.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value="" onChange={(e) => e.target.value && addToList("lpRoute", e.target.value)}>
          <option value="">+ LP route</option>
          {options.lpRoutes.map((s) => (
            <option key={s} value={s}>
              {humanizeTagValue(s)}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={filters.pipeline ?? ""}
          onChange={(e) =>
            nav((sp) => {
              sp.delete("stage");
              if (e.target.value) sp.set("pipeline", e.target.value);
              else sp.delete("pipeline");
            })
          }
        >
          <option value="">Any pipeline</option>
          {options.pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {pipeline && (
          <select
            className={selectCls}
            value={filters.stage ?? ""}
            onChange={(e) => nav((sp) => (e.target.value ? sp.set("stage", e.target.value) : sp.delete("stage")))}
          >
            <option value="">Any stage</option>
            {pipeline.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {anyActive && (
          <button
            type="button"
            onClick={() => nav((sp) => [...sp.keys()].filter((k) => k !== "q").forEach((k) => sp.delete(k)))}
            className="text-xs text-sky-700 hover:underline dark:text-sky-400"
          >
            Clear all
          </button>
        )}
      </div>

      {multi.some((m) => m.values.length) && (
        <div className="flex flex-wrap gap-1">
          {multi.flatMap((m) =>
            m.values.map((v) => (
              <button
                key={`${m.key}:${v}`}
                type="button"
                onClick={() => removeFromList(m.key, v)}
                className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-xs text-navy-800 ring-1 ring-inset ring-navy-200 dark:bg-navy-900 dark:text-navy-100 dark:ring-navy-700"
              >
                {m.label}: {m.render ? m.render(v) : v} <X className="h-3 w-3" />
              </button>
            )),
          )}
        </div>
      )}
    </div>
  );
}
