"use client";

import { useState } from "react";
import {
  Bot,
  Calendar,
  ChevronRight,
  ClipboardList,
  Cog,
  Flag,
  GitBranch,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { JourneyEvent, JourneyLane } from "@/lib/journey/types";
import { cn, etDateTime, etTime } from "@/lib/utils";

const LANE_ICON: Record<JourneyLane, LucideIcon> = {
  message: MessageSquare,
  call: Phone,
  appointment: Calendar,
  workflow: GitBranch,
  stage: Flag,
  pipeline: Flag,
  lp: ClipboardList,
  bot: Bot,
  note: StickyNote,
  tag: Tag,
  system: Cog,
};

/** Lane icon as a component (not a variable) so React never re-creates it. */
export function LaneIcon({ event, className }: { event: Pick<JourneyEvent, "lane" | "kind">; className?: string }) {
  if (event.lane === "message" && event.kind.startsWith("email")) return <Mail className={className} />;
  const Icon = LANE_ICON[event.lane];
  return <Icon className={className} />;
}

/** Detail keys that are plumbing, not something an operator reads. */
const HIDDEN_DETAIL = new Set(["tag", "channel", "direction", "n", "ghlWorkflowId", "sentTag", "approximateTime", "offsetMinutes"]);

export function EventRow({ event, showDate = false }: { event: JourneyEvent; showDate?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetail = detailEntries(event).length > 0;

  return (
    <li
      className={cn(
        "rounded-md",
        event.projected && "border border-dashed border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40",
      )}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2 px-2 py-1.5 text-left text-sm",
          hasDetail ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : "cursor-default",
        )}
        aria-expanded={hasDetail ? open : undefined}
      >
        <span
          className={cn(
            "shrink-0 whitespace-nowrap pt-0.5 text-right font-mono text-[11px] tabular-nums text-slate-500",
            showDate ? "w-[8.5rem]" : "w-[4.5rem]",
          )}
        >
          {showDate ? etDateTime(event.ts).replace(/ ET$/, "").replace(/^\w+ /, "") : etTime(event.ts)}
        </span>
        <LaneIcon event={event} className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", event.projected ? "text-slate-400" : "text-slate-500")} />
        <span
          className={cn(
            "min-w-0 flex-1 break-words",
            event.projected ? "italic text-slate-500 dark:text-slate-400" : "text-navy-900 dark:text-slate-100",
          )}
        >
          {event.title}
          {event.projected && (
            <span className="ml-2 rounded bg-slate-200 px-1 py-px text-[10px] font-medium uppercase not-italic tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              projected
            </span>
          )}
        </span>
        {event.actor && (
          <span className="hidden max-w-[9rem] shrink-0 truncate text-[11px] text-slate-400 sm:inline">{event.actor}</span>
        )}
        {hasDetail && (
          <ChevronRight
            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
          />
        )}
      </button>
      {open && hasDetail && <EventDetail event={event} />}
    </li>
  );
}

function detailEntries(event: JourneyEvent): [string, unknown][] {
  return Object.entries(event.detail ?? {}).filter(
    ([k, v]) => !HIDDEN_DETAIL.has(k) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
}

function EventDetail({ event }: { event: JourneyEvent }) {
  const d = event.detail ?? {};
  const added = Array.isArray(d.added) ? (d.added as string[]) : null;
  const removed = Array.isArray(d.removed) ? (d.removed as string[]) : null;
  const longText = (["body", "note", "reasoning", "notes"] as const)
    .map((k) => (typeof d[k] === "string" ? (d[k] as string) : null))
    .find(Boolean);

  const rest = detailEntries(event).filter(
    ([k]) => !["body", "note", "reasoning", "notes", "added", "removed"].includes(k),
  );

  return (
    <div className="mb-2 ml-[5.25rem] mr-2 space-y-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
      {longText && <p className="whitespace-pre-wrap leading-relaxed">{longText}</p>}
      {(added?.length || removed?.length) && (
        <div className="flex flex-wrap gap-1">
          {added?.map((t) => (
            <span key={`+${t}`} className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              +{t}
            </span>
          ))}
          {removed?.map((t) => (
            <span key={`-${t}`} className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              −{t}
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          {rest.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k.replace(/_/g, " ")}</dt>
              <dd className="min-w-0 break-words font-mono text-[11px]">{renderValue(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function renderValue(key: string, v: unknown): React.ReactNode {
  if (typeof v === "string" && /^https?:\/\//.test(v)) {
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline dark:text-sky-400">
        open
      </a>
    );
  }
  if (typeof v === "string" && /(start|anchor|ts)$/i.test(key) && !Number.isNaN(Date.parse(v))) return etDateTime(v);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
  return <span className="whitespace-pre-wrap">{JSON.stringify(v, null, 1)}</span>;
}
