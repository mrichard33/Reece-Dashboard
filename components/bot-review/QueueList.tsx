"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail, MessagesSquare, Check } from "lucide-react";
import { queueSignal, formatEt, contactLabel, PAGE_SIZE } from "@/lib/botReview/core";
import type { QueueRow } from "@/lib/queries/botReview";

/**
 * The queue column. J / K move the selection, which is why this is a client
 * component — the selection lives in the URL so the review panel can be
 * server-rendered for the selected row, and J/K just push the next one.
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
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No messages in this view.
          </p>
        )}
        <ul>
          {rows.map((r) => {
            const sig = queueSignal(r);
            const selected = r.context_id === selectedId;
            const reviewed = reviewedIds.has(r.context_id) || r.review_count > 0;
            return (
              <li key={r.context_id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.context_id)}
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
                      <ChannelIcon channel={r.channel} />
                      {contactLabel(r)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{r.rule_applied ?? r.workflow_code ?? "—"}</span>
                      <span>·</span>
                      <span>{formatEt(r.generated_at)}</span>
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-medium", TONE[sig.tone])}>{sig.label}</p>
                  </div>
                  {reviewed && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Reviewed" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>
          Showing {shown} of {total}
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
