"use client";

import { useState } from "react";
import {
  Activity as ActivityIcon,
  PhoneIncoming,
  PhoneOutgoing,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { relTime } from "@/lib/utils";
import type {
  Cursor,
  FeedPage,
  LpActivity,
  LpCallLog,
  LpNote,
} from "@/lib/supabase/types";
import type { FeedType } from "@/lib/queries/leads";

type FeedRow = LpCallLog | LpNote | LpActivity;

const EMPTY: Record<FeedType, string> = {
  calls: "No calls yet.",
  notes: "No notes yet.",
  activities: "No activity yet.",
};

/**
 * Generic per-lead feed with keyset "Load more" pagination. Seeded with the
 * server-rendered first page (`initial`); subsequent pages are fetched from
 * /api/leads/[id]/feed with the cursor. Rows only ever append, so there is no
 * duplicate/skip at boundaries (the id tiebreaker in the query guarantees it).
 */
export function LeadFeed({
  leadId,
  type,
  initial,
}: {
  leadId: string;
  type: FeedType;
  initial: FeedPage<FeedRow>;
}) {
  const [rows, setRows] = useState<FeedRow[]>(initial.rows);
  const [cursor, setCursor] = useState<Cursor>(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        cursorDate: cursor.lastDate,
        cursorId: cursor.lastId,
      });
      const res = await fetch(`/api/leads/${leadId}/feed?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const page = (await res.json()) as FeedPage<FeedRow>;
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    } catch {
      /* transient — keep what we have; the button stays for a retry */
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{EMPTY[type]}</p>;
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => (
          <li key={row.id}>
            <FeedRowView type={type} row={row} />
          </li>
        ))}
      </ul>
      {cursor && (
        <div className="pt-3 text-center">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

function FeedRowView({ type, row }: { type: FeedType; row: FeedRow }) {
  if (type === "calls") return <CallRow call={row as LpCallLog} />;
  if (type === "notes") return <NoteRow note={row as LpNote} />;
  return <ActivityRow activity={row as LpActivity} />;
}

function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function RowShell({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CallRow({ call }: { call: LpCallLog }) {
  const inbound = (call.call_direction ?? "").toLowerCase() === "inbound";
  const Icon = inbound ? PhoneIncoming : PhoneOutgoing;
  const duration = fmtDuration(call.call_duration_sec);
  return (
    <RowShell icon={<Icon className="h-3.5 w-3.5 text-slate-500" />}>
      <div className="flex flex-wrap items-center gap-2">
        {call.call_direction && (
          <Badge tone={inbound ? "emerald" : "slate"}>
            {inbound ? "Inbound" : "Outbound"}
          </Badge>
        )}
        {call.call_result && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {call.call_result}
          </span>
        )}
        {duration && <span className="text-xs text-slate-400">{duration}</span>}
      </div>
      {call.call_notes && (
        <p className="mt-1 text-sm text-navy-900 dark:text-slate-200">{call.call_notes}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{relTime(call.call_date)}</span>
        {(call.agent_name ?? call.rep_name) && (
          <span>· {call.agent_name ?? call.rep_name}</span>
        )}
        {call.recording_url && (
          <a
            href={call.recording_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:underline dark:text-sky-400"
          >
            Recording
          </a>
        )}
      </div>
    </RowShell>
  );
}

function NoteRow({ note }: { note: LpNote }) {
  return (
    <RowShell icon={<StickyNote className="h-3.5 w-3.5 text-slate-500" />}>
      <div className="flex flex-wrap items-center gap-2">
        {note.note_category && <Badge tone="navy">{note.note_category}</Badge>}
        {note.note_type && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {note.note_type}
          </span>
        )}
      </div>
      {note.note_body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-navy-900 dark:text-slate-200">
          {note.note_body}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{relTime(note.created_at_lp)}</span>
        {note.created_by_rep_name && <span>· {note.created_by_rep_name}</span>}
      </div>
    </RowShell>
  );
}

function ActivityRow({ activity }: { activity: LpActivity }) {
  return (
    <RowShell icon={<ActivityIcon className="h-3.5 w-3.5 text-slate-500" />}>
      {activity.activity_type && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="sky">{activity.activity_type}</Badge>
        </div>
      )}
      {activity.activity_detail && (
        <p className="mt-1 text-sm text-navy-900 dark:text-slate-200">
          {activity.activity_detail}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{relTime(activity.activity_date)}</span>
        {activity.rep_name && <span>· {activity.rep_name}</span>}
      </div>
    </RowShell>
  );
}
