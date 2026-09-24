"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import type { Flow, FlowKind, FlowNode } from "@/lib/journey/flowLayout";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<FlowKind, string> = {
  start: "bg-navy-800 text-white border-navy-800",
  condition: "bg-sky-50 border-sky-400 text-sky-950 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-700",
  message: "bg-emerald-50 border-emerald-400 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-700",
  wait: "bg-amber-50 border-amber-400 text-amber-950 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700",
  update: "bg-slate-50 border-slate-300 text-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
  workflow: "bg-violet-50 border-violet-400 text-violet-950 dark:bg-violet-950 dark:text-violet-100 dark:border-violet-700",
  webhook: "bg-slate-100 border-slate-400 text-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
  jump: "bg-white border-dashed border-slate-400 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  end: "bg-slate-700 border-slate-700 text-white",
  other: "bg-white border-slate-300 text-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
};

const LEGEND: [FlowKind, string][] = [
  ["message", "SMS / email"],
  ["condition", "Decision"],
  ["wait", "Wait"],
  ["update", "Tags / fields"],
  ["workflow", "Other workflow"],
  ["jump", "Jump"],
];

/**
 * The whole workflow as a tree: every branch side by side, labelled in plain
 * words. Zoom to fit or read at 100%; click any box for its details.
 */
export function Flowchart({ flow, draft }: { flow: Flow; draft: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const [scale, setScale] = useState<number | null>(null);
  const [selected, setSelected] = useState<FlowNode | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setFit(Math.max(0.2, Math.min(1, (el.clientWidth - 16) / flow.width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flow.width]);

  // Open readable (80%), not shrunk to fit: the spine runs down the left, so
  // the first screen is the start of the workflow. "Fit width" is one click.
  const z = scale ?? Math.min(1, Math.max(fit, 0.8));
  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
        <span>
          {flow.stats.steps} steps · {flow.stats.messages} messages · {flow.stats.conditions} decisions · {flow.stats.waits} waits
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {LEGEND.map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cn("inline-block h-3 w-3 rounded-sm border", KIND_STYLE[k])} />
              {label}
            </span>
          ))}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <ZoomBtn label="Zoom out" onClick={() => setScale(Math.max(0.2, z - 0.15))}>
            <Minus className="h-3.5 w-3.5" />
          </ZoomBtn>
          <span className="w-10 text-center tabular-nums">{Math.round(z * 100)}%</span>
          <ZoomBtn label="Zoom in" onClick={() => setScale(Math.min(1.5, z + 0.15))}>
            <Plus className="h-3.5 w-3.5" />
          </ZoomBtn>
          <ZoomBtn label="Fit width" onClick={() => setScale(fit)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ZoomBtn>
        </span>
      </div>

      {draft && (
        <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          This workflow is a draft in GHL — nothing below is running.
        </p>
      )}

      <div className="relative">
        <div
          ref={boxRef}
          className={cn(
            "h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950",
            draft && "opacity-70",
          )}
        >
          <div style={{ width: flow.width * z + 16, height: flow.height * z + 16 }} className="relative">
            <div style={{ transform: `scale(${z})`, transformOrigin: "0 0", width: flow.width, height: flow.height }} className="absolute left-2 top-2">
              <svg width={flow.width} height={flow.height} className="absolute inset-0 text-slate-400 dark:text-slate-600" aria-hidden>
                {flow.edges.map((e, i) => {
                  const a = byId.get(e.from);
                  const b = byId.get(e.to);
                  if (!a || !b) return null;
                  const x1 = a.x + a.w / 2;
                  const y1 = a.y + a.h;
                  const x2 = b.x + b.w / 2;
                  const y2 = b.y;
                  // Elbow: turn just under the parent, above the branch labels.
                  const turn = y1 + 8;
                  return (
                    <path
                      key={i}
                      d={x1 === x2 ? `M${x1},${y1} V${y2}` : `M${x1},${y1} V${turn} H${x2} V${y2}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      markerEnd="url(#arrow)"
                    />
                  );
                })}
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                  </marker>
                </defs>
              </svg>

              {flow.edges.map((e, i) => {
                if (!e.label) return null;
                const b = byId.get(e.to);
                if (!b) return null;
                return (
                  <div
                    key={`l${i}`}
                    title={e.label}
                    style={{ left: b.x, top: b.y - 40, width: b.w }}
                    className="absolute line-clamp-2 rounded bg-white/90 px-1.5 py-0.5 text-center text-[10px] leading-tight text-sky-900 ring-1 ring-sky-200 dark:bg-slate-900/90 dark:text-sky-200 dark:ring-sky-800"
                  >
                    {e.label}
                  </div>
                );
              })}

              {flow.nodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSelected(n)}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                  className={cn(
                    "absolute overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition hover:ring-2 hover:ring-navy-600",
                    KIND_STYLE[n.kind],
                    n.kind === "condition" && "rounded-xl border-2",
                    selected?.id === n.id && "ring-2 ring-navy-700",
                  )}
                >
                  <div className="flex items-center gap-1 truncate text-[11px] font-semibold">
                    {n.title}
                    {n.skipped && <span className="rounded bg-rose-100 px-1 text-[9px] font-medium text-rose-700">not running</span>}
                  </div>
                  {n.lines.slice(0, 2).map((l, i) => (
                    <div key={i} className="truncate text-[10px] opacity-80">
                      {l}
                    </div>
                  ))}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selected && (
          <aside className="absolute right-3 top-3 z-10 max-h-[60vh] w-80 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="font-semibold text-navy-900 dark:text-white">{selected.title}</p>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close">
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
            {selected.detail?.name && selected.detail.name !== selected.title && (
              <p className="text-slate-500">Step: {selected.detail.name}</p>
            )}
            {selected.lines.map((l, i) => (
              <p key={i} className="text-slate-700 dark:text-slate-200">
                {l}
              </p>
            ))}
            {selected.detail?.subject && <p className="mt-2 font-medium">Subject: {selected.detail.subject}</p>}
            {selected.detail?.from && <p className="text-slate-500">From: {selected.detail.from}</p>}
            {selected.detail?.text && (
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">{plain(selected.detail.text)}</p>
            )}
            {selected.workflowIds?.map((id) => (
              <Link key={id} href={`/workflows/${id}` as Route} className="mt-1 block text-sky-700 hover:underline dark:text-sky-400">
                Open workflow {id.slice(0, 8)} ↗
              </Link>
            ))}
          </aside>
        )}
      </div>

      {flow.unreachable.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500">
            {flow.unreachable.length} step{flow.unreachable.length === 1 ? "" : "s"} not connected to the start (never run)
          </summary>
          <ul className="mt-1 flex flex-wrap gap-1">
            {flow.unreachable.map((u) => (
              <li key={u.id} className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-slate-500">
                {u.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ZoomBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded border border-slate-300 p-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

function plain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
