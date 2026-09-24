"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import type { WorkflowRow } from "@/lib/queries/workflows";
import { ROUTES, routeFor, type RouteKey } from "@/lib/workflows/routes";
import { Badge } from "@/components/ui/Badge";
import { cn, num, relTime } from "@/lib/utils";

type SortKey = "code" | "name" | "status" | "active" | "changed";

/**
 * Workflows, grouped by funnel route (2026-09-25). Search, sort, hide drafts,
 * and a route map on top that shows where each group sits in a lead's life.
 */
export function WorkflowsIndex({ rows }: { rows: WorkflowRow[] }) {
  const [q, setQ] = useState("");
  const [hideDrafts, setHideDrafts] = useState(true);
  const [route, setRoute] = useState<RouteKey | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "code", dir: 1 });

  const withRoute = useMemo(
    () => rows.map((r) => ({ ...r, route: routeFor({ stageFamily: r.stageFamily, canonicalCode: r.canonicalCode, name: r.name }) })),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return withRoute.filter(
      (r) =>
        (!hideDrafts || r.status === "published") &&
        (!term || r.name.toLowerCase().includes(term) || (r.canonicalCode ?? "").toLowerCase().includes(term)),
    );
  }, [withRoute, q, hideDrafts]);

  const sorted = useMemo(() => {
    const val = (r: (typeof filtered)[number]): string | number => {
      switch (sort.key) {
        case "code":
          return r.canonicalCode ?? "~";
        case "name":
          return r.name.toLowerCase();
        case "status":
          return r.status;
        case "active":
          return r.activeLeads ?? -1;
        case "changed":
          return r.lastModified ?? "";
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c * sort.dir;
    });
  }, [filtered, sort]);

  const byRoute = useMemo(() => {
    const m = new Map<RouteKey, typeof sorted>();
    for (const r of sorted) m.set(r.route, [...(m.get(r.route) ?? []), r]);
    return m;
  }, [sorted]);

  const stats = (key: RouteKey) => {
    const all = withRoute.filter((r) => r.route === key);
    return {
      published: all.filter((r) => r.status === "published").length,
      drafts: all.filter((r) => r.status !== "published").length,
      active: all.reduce((n, r) => n + (r.activeLeads ?? 0), 0),
    };
  };

  const shownRoutes = ROUTES.filter((r) => (!route || r.key === route) && (byRoute.get(r.key)?.length ?? 0) > 0);

  return (
    <div className="space-y-5">
      {/* Route map */}
      <section aria-label="Funnel route map" className="space-y-2">
        <div className="-mx-1 flex items-stretch gap-1 overflow-x-auto px-1 pb-1">
          {ROUTES.filter((r) => r.main).map((r, i) => {
            const s = stats(r.key);
            return (
              <div key={r.key} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                <RouteBox def={r} stats={s} active={route === r.key} onClick={() => setRoute(route === r.key ? null : r.key)} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {ROUTES.filter((r) => !r.main).map((r) => (
            <RouteBox key={r.key} def={r} stats={stats(r.key)} active={route === r.key} onClick={() => setRoute(route === r.key ? null : r.key)} compact />
          ))}
        </div>
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by code or name (e.g. S2.1, calculator)"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={hideDrafts} onChange={(e) => setHideDrafts(e.target.checked)} />
          Hide drafts
        </label>
        {route && (
          <button type="button" onClick={() => setRoute(null)} className="text-xs text-sky-700 hover:underline dark:text-sky-400">
            Show all routes
          </button>
        )}
        <span className="text-xs text-slate-500">{num(sorted.length)} workflows</span>
      </div>

      {shownRoutes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No workflows match.</p>}

      {shownRoutes.map((r) => {
        const list = byRoute.get(r.key) ?? [];
        return (
          <section key={r.key} id={`route-${r.key}`} className="space-y-1">
            <h3 className="flex items-baseline gap-2 text-sm font-semibold text-navy-900 dark:text-white">
              {r.label}
              <span className="text-xs font-normal text-slate-500">{r.blurb}</span>
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <Th label="Code" k="code" sort={sort} setSort={setSort} className="w-28" />
                    <Th label="Workflow" k="name" sort={sort} setSort={setSort} />
                    <Th label="Status" k="status" sort={sort} setSort={setSort} className="w-28" />
                    <Th label="Active leads" k="active" sort={sort} setSort={setSort} className="w-28" />
                    <Th label="Last changed" k="changed" sort={sort} setSort={setSort} className="w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((w) => (
                    <tr key={w.id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/50", w.status !== "published" && "opacity-70")}>
                      <td className="px-3 py-2 font-mono text-xs">{w.canonicalCode ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">
                        <Link href={`/workflows/${w.ghlWorkflowId}` as Route} className="text-navy-800 hover:underline dark:text-slate-100">
                          {w.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {w.status === "published" ? (
                          <Badge tone="emerald" dot>
                            Published
                          </Badge>
                        ) : (
                          <Badge tone="amber">Draft</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {w.activeLeads === null ? <span className="text-slate-400">—</span> : num(w.activeLeads)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{relTime(w.lastModified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RouteBox({
  def,
  stats,
  active,
  onClick,
  compact = false,
}: {
  def: (typeof ROUTES)[number];
  stats: { published: number; drafts: number; active: number };
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={def.blurb}
      className={cn(
        "rounded-lg border text-left transition",
        compact ? "px-2.5 py-1.5" : "min-w-[8.5rem] px-3 py-2",
        active
          ? "border-navy-700 bg-navy-50 ring-2 ring-navy-600 dark:border-sky-400 dark:bg-navy-900"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900",
      )}
    >
      <div className="text-xs font-semibold text-navy-900 dark:text-white">{def.label}</div>
      <div className="text-[11px] text-slate-500">
        {stats.published} live{stats.drafts ? ` · ${stats.drafts} draft` : ""}
        {!compact && (
          <>
            <br />
            {num(stats.active)} leads in now
          </>
        )}
      </div>
    </button>
  );
}

function Th({
  label,
  k,
  sort,
  setSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  className?: string;
}) {
  const on = sort.key === k;
  return (
    <th className={cn("px-3 py-2", className)}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : k === "active" || k === "changed" ? -1 : 1 })}
        className="inline-flex items-center gap-1 uppercase hover:text-slate-700 dark:hover:text-slate-200"
      >
        {label}
        {on && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}
