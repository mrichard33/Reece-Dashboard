"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, Bookmark, ChevronRight, Search, Star, Trash2 } from "lucide-react";
import type { WorkflowRow } from "@/lib/queries/workflows";
import type { WorkflowPreset } from "@/lib/queries/workflowPrefs";
import { ROUTES, type RouteKey } from "@/lib/workflows/routes";
import { applyFilters, DEFAULT_FILTERS, sortRows, type SortKey, type StatusFilter, type WorkflowFilterState } from "@/lib/workflows/filters";
import { deletePreset, savePreset, toggleFavorite } from "@/lib/actions/workflowPrefs";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { cn, num, relTime } from "@/lib/utils";

type Props = {
  rows: WorkflowRow[];
  favorites: string[];
  presets: WorkflowPreset[];
  sendActivity: { computedAt: string; days: number } | { error: string };
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  published: "Published",
  no_sends: "Published, no sends seen",
  turned_off: "Published, messages turned off",
  draft: "Drafts",
  all: "Everything",
};

/**
 * Workflows, grouped by funnel route and ordered by hand-off chain
 * (2026-09-25). Search, filter, sort, star, save the filter for next time,
 * and see whether each workflow really sent anything in the last 30 days.
 */
export function WorkflowsIndex({ rows, favorites: initialFavorites, presets: initialPresets, sendActivity }: Props) {
  const [f, setF] = useState<WorkflowFilterState>(DEFAULT_FILTERS);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(initialFavorites));
  const [presets, setPresets] = useState<WorkflowPreset[]>(initialPresets);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const chain = useMemo(() => new Map(rows.filter((r) => r.chain).map((r) => [r.ghlWorkflowId, r.chain!.index])), [rows]);
  const shown = useMemo(() => sortRows(applyFilters(rows, f, favorites), f.sort, favorites, chain), [rows, f, favorites, chain]);
  const byRoute = useMemo(() => {
    const m = new Map<RouteKey, WorkflowRow[]>();
    for (const r of shown) m.set(r.route, [...(m.get(r.route) ?? []), r]);
    return m;
  }, [shown]);

  const stats = (key: RouteKey) => {
    const all = rows.filter((r) => r.route === key);
    return {
      published: all.filter((r) => r.status === "published").length,
      drafts: all.filter((r) => r.status !== "published").length,
      active: all.reduce((n, r) => n + (r.activeLeads ?? 0), 0),
      noSends: all.filter((r) => r.status === "published" && r.sending?.verdict === "no_sends_seen").length,
      turnedOff: all.filter((r) => r.status === "published" && r.sending?.verdict === "turned_off").length,
    };
  };

  const update = (patch: Partial<WorkflowFilterState>) => {
    setActivePreset(null);
    setF((cur) => ({ ...cur, ...patch }));
  };
  const toggleRoute = (key: RouteKey) => update({ routes: f.routes.includes(key) ? f.routes.filter((k) => k !== key) : [...f.routes, key] });
  const setSort = (key: SortKey) =>
    update({ sort: { key, dir: f.sort.key === key ? ((f.sort.dir * -1) as 1 | -1) : key === "active" || key === "sends" || key === "changed" ? -1 : 1 } });

  const star = (id: string) => {
    const on = !favorites.has(id);
    setFavorites((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    start(async () => {
      const res = await toggleFavorite(id, on);
      if (!res.ok) {
        setError(res.error ?? "Could not save the star.");
        setFavorites((cur) => {
          const next = new Set(cur);
          if (on) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    });
  };

  const applyPreset = (p: WorkflowPreset) => {
    setF(p.filters);
    setActivePreset(p.id);
  };
  const submitPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    start(async () => {
      const res = await savePreset(name, f);
      if (!res.ok || !res.id) {
        setError(res.error ?? "Could not save the filter.");
        return;
      }
      setPresets((cur) => [...cur.filter((p) => p.name !== name), { id: res.id!, name, filters: f }].sort((a, b) => a.name.localeCompare(b.name)));
      setActivePreset(res.id);
      setPresetName("");
      setSaving(false);
    });
  };
  const removePreset = (p: WorkflowPreset) => {
    setPresets((cur) => cur.filter((x) => x.id !== p.id));
    if (activePreset === p.id) setActivePreset(null);
    start(async () => {
      const res = await deletePreset(p.id);
      if (!res.ok) {
        setError(res.error ?? "Could not delete the filter.");
        setPresets((cur) => [...cur, p].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  };

  const shownRoutes = ROUTES.filter((r) => (byRoute.get(r.key)?.length ?? 0) > 0);
  const hasSends = !("error" in sendActivity);

  return (
    <div className="space-y-5">
      {/* Route map */}
      <section aria-label="Funnel route map" className="space-y-2">
        <div className="-mx-1 flex items-stretch gap-1 overflow-x-auto px-1 pb-1">
          {ROUTES.filter((r) => r.main).map((r, i) => (
            <div key={r.key} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
              <RouteBox def={r} stats={stats(r.key)} active={f.routes.includes(r.key)} onClick={() => toggleRoute(r.key)} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ROUTES.filter((r) => !r.main).map((r) => (
            <RouteBox key={r.key} def={r} stats={stats(r.key)} active={f.routes.includes(r.key)} onClick={() => toggleRoute(r.key)} compact />
          ))}
        </div>
      </section>

      {/* Saved filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Bookmark className="h-3.5 w-3.5" /> Saved filters
          <InfoPopover helpKey="workflows.presets" align="left" />
        </span>
        {presets.length === 0 && !saving && <span className="text-xs text-slate-400">None yet — set up the filters below and save them.</span>}
        {presets.map((p) => (
          <span key={p.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                "rounded-l-full border px-2.5 py-0.5 text-xs font-medium",
                activePreset === p.id
                  ? "border-navy-700 bg-navy-800 text-white dark:border-sky-400 dark:bg-navy-600"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
              )}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => removePreset(p)}
              aria-label={`Delete saved filter ${p.name}`}
              title="Delete this saved filter"
              className="rounded-r-full border border-l-0 border-slate-200 px-1.5 py-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
        {saving ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPreset();
                if (e.key === "Escape") setSaving(false);
              }}
              placeholder="Name this filter"
              maxLength={60}
              className="w-44 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <button type="button" onClick={submitPreset} className="rounded-md bg-navy-800 px-2 py-0.5 text-xs font-medium text-white">
              Save
            </button>
            <button type="button" onClick={() => setSaving(false)} className="text-xs text-slate-500 hover:underline">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setSaving(true)} className="text-xs text-sky-700 hover:underline dark:text-sky-400">
            + Save current filters
          </button>
        )}
        {error && (
          <span className="text-xs text-rose-600">
            {error}{" "}
            <button type="button" onClick={() => setError(null)} className="underline">
              dismiss
            </button>
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <input
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search by code or name"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          Show
          <select
            value={f.status}
            onChange={(e) => update({ status: e.target.value as StatusFilter })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]}
              </option>
            ))}
          </select>
          <InfoPopover helpKey="workflows.noSends" align="left" />
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <select
            value={f.hasMessages === null ? "any" : f.hasMessages ? "yes" : "no"}
            onChange={(e) => update({ hasMessages: e.target.value === "any" ? null : e.target.value === "yes" })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="any">With or without messages</option>
            <option value="yes">Sends messages</option>
            <option value="no">No messages (routing only)</option>
          </select>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={f.favoritesOnly} onChange={(e) => update({ favoritesOnly: e.target.checked })} />
          <Star className="h-3.5 w-3.5 text-amber-500" /> Favorites only
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          Order
          <select
            value={f.sort.key}
            onChange={(e) => update({ sort: { key: e.target.value as SortKey, dir: f.sort.dir } })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="chain">Funnel order (chain)</option>
            <option value="favorites">Favorites first</option>
            <option value="code">Code</option>
            <option value="name">Name</option>
            <option value="active">Leads in now</option>
            <option value="sends">Sends (30 d)</option>
            <option value="changed">Last changed</option>
          </select>
          <InfoPopover helpKey="workflows.chainOrder" align="left" />
        </label>
        {(f.routes.length > 0 || f.q || f.status !== DEFAULT_FILTERS.status || f.hasMessages !== null || f.favoritesOnly) && (
          <button type="button" onClick={() => update(DEFAULT_FILTERS)} className="text-xs text-sky-700 hover:underline dark:text-sky-400">
            Reset
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {num(shown.length)} workflows
          {hasSends ? ` · sends as of ${relTime((sendActivity as { computedAt: string }).computedAt)}` : " · sends not computed"}
        </span>
      </div>

      {shownRoutes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No workflows match these filters.</p>}

      {shownRoutes.map((r) => {
        const list = byRoute.get(r.key) ?? [];
        return (
          <section key={r.key} id={`route-${r.key}`} className="space-y-1">
            <h3 className="flex items-baseline gap-2 text-sm font-semibold text-navy-900 dark:text-white">
              {r.label}
              <span className="text-xs font-normal text-slate-500">{r.blurb}</span>
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="w-8 px-2 py-2" aria-label="Favorite" />
                    <Th label="Code" k="code" sort={f.sort} onSort={setSort} className="w-28" />
                    <Th label="Workflow" k="name" sort={f.sort} onSort={setSort} />
                    <th className="w-24 px-3 py-2">Status</th>
                    <Th label="Leads in now" k="active" sort={f.sort} onSort={setSort} className="w-28" />
                    <th className="w-44 px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        Sending (30 d) <InfoPopover helpKey="workflows.sending" />
                      </span>
                    </th>
                    <Th label="Last changed" k="changed" sort={f.sort} onSort={setSort} className="w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((w) => (
                    <tr key={w.id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/50", w.status !== "published" && "opacity-70")}>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => star(w.ghlWorkflowId)}
                          aria-label={favorites.has(w.ghlWorkflowId) ? "Remove from favorites" : "Add to favorites"}
                          title={favorites.has(w.ghlWorkflowId) ? "Remove from favorites" : "Add to favorites"}
                          className="text-slate-300 hover:text-amber-500"
                        >
                          <Star className={cn("h-4 w-4", favorites.has(w.ghlWorkflowId) && "fill-amber-400 text-amber-500")} />
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {f.sort.key === "chain" && w.chain && w.chain.depth > 0 && <span className="text-slate-300">{"· ".repeat(Math.min(w.chain.depth, 4))}</span>}
                        {w.canonicalCode ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/workflows/${w.ghlWorkflowId}` as Route} className="text-navy-800 hover:underline dark:text-slate-100">
                          {w.name}
                        </Link>
                        {w.messageSteps === 0 && <span className="ml-2 text-[11px] text-slate-400">routing only</span>}
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
                      <td className="px-3 py-2 text-xs tabular-nums">{w.activeLeads === null ? <span className="text-slate-400">—</span> : num(w.activeLeads)}</td>
                      <td className="px-3 py-2 text-xs">
                        <SendingCell row={w} />
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

function SendingCell({ row }: { row: WorkflowRow }) {
  const s = row.sending;
  if (row.messageSteps === 0) return <span className="text-slate-400">no messages</span>;
  if (!s) return <span className="text-slate-400">not computed</span>;
  switch (s.verdict) {
    case "turned_off":
      return (
        <span className="inline-flex flex-wrap items-center gap-1" title={s.note}>
          <Badge tone="rose">Messages turned off</Badge>
          <span className="text-slate-500">{num(s.entries30d)} leads in</span>
        </span>
      );
    case "no_sends_seen":
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Badge tone="rose">No sends seen</Badge>
          <span className="text-slate-500">{num(s.entries30d)} leads in</span>
        </span>
      );
    case "too_few_to_judge":
      return (
        <span className="text-amber-700 dark:text-amber-400" title={s.note}>
          0 sent · {num(s.entries30d)} in — too few to judge
        </span>
      );
    case "quiet":
      return <span className="text-slate-400">quiet — no leads in, nothing sent</span>;
    case "unknown":
      return (
        <span className="text-slate-400" title={s.note ?? "Could not measure"}>
          {num(s.entries30d)} leads in · sends unknown
        </span>
      );
    case "sending":
      return (
        <span className="tabular-nums text-slate-700 dark:text-slate-200" title={s.basis === "stamp" ? "Exact: counted from the workflow's own send stamps" : s.basis === "content" ? "Counted by matching sent text to each message" : "Exact where stamped, matched by text elsewhere"}>
          {num(s.sends30d)} sent · {num(s.entries30d)} in
          {s.basis !== "stamp" && <span className="text-slate-400"> ≈</span>}
          {s.offSteps > 0 && <span className="text-amber-700 dark:text-amber-400"> · {s.offSteps} off</span>}
        </span>
      );
  }
}

function RouteBox({
  def,
  stats,
  active,
  onClick,
  compact = false,
}: {
  def: (typeof ROUTES)[number];
  stats: { published: number; drafts: number; active: number; noSends: number; turnedOff: number };
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={def.blurb}
      aria-pressed={active}
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
        {stats.turnedOff > 0 && <span className="text-rose-600"> · {stats.turnedOff} turned off</span>}
        {stats.noSends > 0 && <span className="text-rose-600"> · {stats.noSends} no sends seen</span>}
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
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: WorkflowFilterState["sort"];
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const on = sort.key === k;
  return (
    <th className={cn("px-3 py-2", className)}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-slate-700 dark:hover:text-slate-200">
        {label}
        {on && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}
