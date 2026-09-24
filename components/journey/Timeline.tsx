"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JourneyEvent } from "@/lib/journey/types";
import { LANE_CHIPS, visibleEvents } from "@/lib/journey/normalize";
import { cn, etDayKey, etDayLabel } from "@/lib/utils";
import { InfoPopover } from "@/components/help/InfoPopover";
import { EventRow } from "./EventRow";

/**
 * Oldest → newest, grouped by ET day, with a hard NOW divider. Projected rows
 * only ever render BELOW the divider, dashed and labelled. The scroll box
 * opens at NOW, because "what is happening" is the question people bring.
 */
export function Timeline({
  events,
  next,
  maxHeightClass = "max-h-[32rem]",
}: {
  events: JourneyEvent[];
  next: JourneyEvent[];
  maxHeightClass?: string;
}) {
  const [lanes, setLanes] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => visibleEvents(events, lanes), [events, lanes]);
  const shownNext = useMemo(
    () => (lanes.length === 0 || lanes.includes("message") ? next : []),
    [next, lanes],
  );
  const groups = useMemo(() => groupByDay(shown), [shown]);

  useEffect(() => {
    const box = boxRef.current;
    const now = nowRef.current;
    if (box && now) box.scrollTop = Math.max(0, now.offsetTop - box.clientHeight + 120);
  }, [groups.length]);

  const toggle = (key: string) => {
    if (key === "all") return setLanes([]);
    setLanes((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 pb-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timeline</span>
        {LANE_CHIPS.map((c) => {
          const active = c.key === "all" ? lanes.length === 0 : lanes.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition",
                active
                  ? "bg-navy-800 text-white ring-navy-800 dark:bg-navy-600 dark:ring-navy-600"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div ref={boxRef} className={cn("overflow-y-auto pr-1", maxHeightClass)}>
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">Nothing in this lane yet.</p>
        )}
        {groups.map((g) => (
          <section key={g.key}>
            <h4 className="sticky top-0 z-10 flex items-center gap-2 bg-white py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              {g.label}
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </h4>
            <ul className="space-y-0.5">
              {g.events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          </section>
        ))}

        <div ref={nowRef} className="my-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brick">
          <span className="h-0.5 flex-1 bg-brick/60" />
          Now
          <span className="h-0.5 flex-1 bg-brick/60" />
        </div>

        {shownNext.length > 0 ? (
          <>
            <div className="flex items-center gap-1 pb-1 text-[11px] text-slate-500">
              Projected from the workflow&apos;s steps — best effort
              <InfoPopover helpKey="leads.projected" align="left" />
            </div>
            <ul className="space-y-1">
              {shownNext.map((e) => (
                <EventRow key={e.id} event={e} showDate />
              ))}
            </ul>
          </>
        ) : (
          <p className="pb-2 text-center text-[11px] text-slate-400">No projected sends.</p>
        )}
      </div>
    </div>
  );
}

function groupByDay(events: JourneyEvent[]): { key: string; label: string; events: JourneyEvent[] }[] {
  const out: { key: string; label: string; events: JourneyEvent[] }[] = [];
  for (const e of events) {
    const key = etDayKey(e.ts);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: etDayLabel(e.ts), events: [] };
      out.push(g);
    }
    g.events.push(e);
  }
  return out;
}
