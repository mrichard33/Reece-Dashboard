"use client";

import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail, MessagesSquare, Check } from "lucide-react";
import { groupByContact, formatEt, PAGE_SIZE } from "@/lib/botReview/core";
import type { QueueRow } from "@/lib/queries/botReview";

/**
 * The queue column — one box per CONVERSATION, not per message.
 *
 * The bot messages the same lead several times over days. One box each made
 * four messages to one person look like four different leads, and it scattered
 * the context a reviewer needs across four screens. Each box now says how many
 * messages the conversation holds and how many are still to review; the
 * individual messages are picked inside the thread.
 *
 * J / K still step MESSAGE by message, because that is the unit being scored —
 * they simply walk into the next conversation when the current one runs out.
 * The selection lives in the URL so the review panel can be server-rendered.
 */

function ChannelIcon({ channel }: { channel: string | null }) {
  const cls = "h-3.5 w-3.5 text-slate-400";
  if (channel === "email") return <Mail className={cls} aria-label="Email" />;
  if (channel === "live_chat") return <MessagesSquare className={cls} aria-label="Live chat" />;
  return <MessageSquare className={cls} aria-label="SMS" />;
}

const TONE: Record<string, string> = {
  emerald: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  rose: "text-rose-700 dark:text-rose-400",
  slate: "text-slate-500 dark:text-slate-400",
};

export function QueueList({
  rows,
  selectedId,
  total,
  page,
  reviewedIds,
  onSelect,
  onLoadMore,
}: {
  rows: QueueRow[];
  selectedId: number | null;
  total: number;
  page: number;
  reviewedIds: Set<number>;
  onSelect: (contextId: number) => void;
  onLoadMore: () => void;
}) {
  const groups = useMemo(() => groupByContact(rows), [rows]);

  // J / K move down / up. Ignored while typing so the note field still works.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const isDown = k === "j" || e.key === "ArrowRight";
      const isUp = k === "k" || e.key === "ArrowLeft";
      if (!isDown && !isUp) return;
      e.preventDefault();
      if (!rows.length) return;
      const i = rows.findIndex((r) => r.context_id === selectedId);
      const next = i === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, i + (isDown ? 1 : -1)));
      const row = rows[next];
      if (row) onSelect(row.context_id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selectedId, onSelect]);

  const shown = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No messages in this view.
          </p>
        )}
        <ul>
          {groups.map((g) => {
            // Selected when the message being reviewed is one of this
            // conversation's, so the box and the thread never disagree.
            const selected = g.rows.some((r) => r.context_id === selectedId);
            const left = g.rows.filter((r) => r.review_count === 0 && !reviewedIds.has(r.context_id)).length;
            // Opening a conversation lands on its first message still to
            // review — the one the reviewer came for.
            const target = g.rows.find((r) => r.review_count === 0 && !reviewedIds.has(r.context_id)) ?? g.rows[0]!;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => onSelect(target.context_id)}
                  aria-current={selected}
                  className={cn(
                    "flex w-full items-start gap-2 border-l-2 px-3 py-2.5 text-left transition",
                    selected
                      ? "border-navy-600 bg-navy-50/70 dark:bg-navy-900/40"
                      : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-navy-900 dark:text-white">
                      {g.channels.map((c) => (
                        <ChannelIcon key={c} channel={c} />
                      ))}
                      {g.label}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {g.messageCount} message{g.messageCount === 1 ? "" : "s"}
                      </span>
                      <span>·</span>
                      <span className={left > 0 ? "font-medium text-navy-700 dark:text-navy-200" : undefined}>
                        {left > 0 ? `${left} to review` : "All reviewed"}
                      </span>
                      <span>·</span>
                      <span>{formatEt(g.latestAt)}</span>
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-medium", TONE[g.signal.tone])}>{g.signal.label}</p>
                  </div>
                  {left === 0 && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Reviewed" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>
          {groups.length} conversation{groups.length === 1 ? "" : "s"} · {shown} of {total} messages
        </span>
        {shown < total && (
          <button type="button" onClick={onLoadMore} className="font-medium text-navy-700 hover:underline dark:text-navy-200">
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
