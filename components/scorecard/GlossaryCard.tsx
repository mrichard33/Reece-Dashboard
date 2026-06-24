"use client";

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { StatusDot } from "@/components/ui/StatusDot";
import { ScCard } from "./ScCard";
import { SC_GLOSSARY } from "./viz/glossary";
import { SC_COLOR } from "./viz/colors";
import { MarkTick, MarkDot, MarkChip } from "./viz/marks";

/** Plain-language definitions for every term & symbol on the page — collapsed by default. */
export function GlossaryCard() {
  const [open, setOpen] = useState(false);
  const key = [
    { mark: <span className="h-2.5 w-4 rounded-sm" style={{ background: SC_COLOR.emerald }} />, label: "Green", desc: "at or ahead of target." },
    { mark: <span className="h-2.5 w-4 rounded-sm" style={{ background: SC_COLOR.amber }} />, label: "Amber", desc: "watch — slightly behind." },
    { mark: <span className="h-2.5 w-4 rounded-sm" style={{ background: SC_COLOR.rose }} />, label: "Red", desc: "behind target; act on it." },
    { mark: <MarkTick />, label: "Upright line", desc: "the target / goal on a bar." },
    { mark: <MarkDot />, label: "Dot", desc: "a funnel step's prorated goal." },
    { mark: <TriangleAlert size={14} className="text-amber-500" />, label: "Warning", desc: "provisional figure, not yet reconciled." },
    { mark: <StatusDot status="healthy" />, label: "Pulsing dot", desc: "a live status indicator." },
    { mark: <MarkChip />, label: "Arrow chip", desc: "conversion rate between funnel steps." },
  ];
  return (
    <ScCard
      id="sc-glossary"
      title="Glossary — what the words & symbols mean"
      lead={open ? "Hover any dotted term on the page for its meaning. Everything is gathered here too." : undefined}
      action={
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {open ? "Hide" : "Show"} glossary
          <ChevronDown size={14} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>
      }
    >
      {open ? (
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Colors &amp; symbols</div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {key.map((k, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex w-5 shrink-0 justify-center">{k.mark}</span>
                  <div className="text-[12px] leading-snug">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{k.label}</span>{" "}
                    <span className="text-slate-500 dark:text-slate-400">{k.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-slate-100 pt-4 dark:border-slate-800 md:grid-cols-2">
            {SC_GLOSSARY.map((g, i) => (
              <div key={i}>
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</div>
                <dl className="space-y-2">
                  {g.items.map((it, j) => (
                    <div key={j} className="flex gap-3">
                      <dt className="w-36 shrink-0 font-mono text-[12px] font-semibold leading-snug tabular text-slate-700 dark:text-slate-200">{it.term}</dt>
                      <dd className="flex-1 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">{it.def}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 text-[12.5px] text-slate-500 dark:text-slate-400">
          Plain-language definitions for every term, color and symbol on this page. Hover any dotted term in place, or open this for the full list.
        </div>
      )}
    </ScCard>
  );
}
