"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { formatEt, skipReasonLabel } from "@/lib/botReview/core";
import type { TimelineItem } from "@/lib/botReview/core";
import type { QueueRow, MyFeedback } from "@/lib/queries/botReview";

/**
 * The whole conversation on one clock: everything the lead said, and every
 * message the bot sent back, oldest first.
 *
 * The reviewer clicks the message they want to score. The selected one carries
 * the navy border and "Reviewing this message"; ones already scored show their
 * verdict; the rest invite a click. That is the change from Phase 1's first
 * cut, which showed a single message per screen and left the reviewer judging
 * a reply with no sight of the replies around it.
 *
 * Lead turns come from the fingerprint's input_snapshot — the conversation AS
 * THE BOT SAW IT. That is the only honest thing to score against: the live
 * thread has moved on, and judging a reply against messages that arrived after
 * it would be unfair to the bot and useless as evidence.
 *
 * 2026-10-06 (Charles Jessup): only the bot's own messages say "Bot". A lead
 * turn carries the lead's name; any other outbound turn (a workflow text, a
 * person on the team) says so, because the old view called every outbound
 * line "Bot" — GHL activity rows included. A skip is a small grey note, not a
 * red bot bubble: the bot did not speak.
 */

const VERDICT: Record<string, { label: string; className: string }> = {
  good: { label: "Good", className: "text-emerald-700 dark:text-emerald-400" },
  needs_work: { label: "Needs work", className: "text-amber-700 dark:text-amber-400" },
  unsafe: { label: "Unsafe", className: "text-rose-700 dark:text-rose-400" },
};

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{children}</p>;
}

export function ConversationThread({
  timeline,
  rows,
  selectedId,
  feedbackByContext,
  reviewedIds,
  leadLabel,
  onSelect,
}: {
  timeline: TimelineItem[];
  rows: QueueRow[];
  selectedId: number | null;
  feedbackByContext: Record<number, MyFeedback>;
  reviewedIds: Set<number>;
  leadLabel: string;
  onSelect: (contextId: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const byId = new Map(rows.map((r) => [r.context_id, r]));

  function toggle(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (timeline.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No conversation was captured for this lead.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {timeline.map((item) => {
        if (item.kind === "turn") {
          return (
            <div key={item.key} className={cn("flex", item.inbound ? "justify-start" : "justify-end")}>
              <div className="max-w-[88%] sm:max-w-[78%]">
                <Meta>
                  {item.inbound ? leadLabel : "Reece · not the bot"}
                  {item.at ? ` · ${formatEt(item.at)}` : ""}
                </Meta>
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-relaxed",
                    item.inbound
                      ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                      : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                  )}
                >
                  {item.body?.trim() || <span className="italic text-slate-400">(empty)</span>}
                </div>
              </div>
            </div>
          );
        }

        const row = byId.get(item.contextId);
        if (!row) return null;

        const selected = row.context_id === selectedId;
        const mine = feedbackByContext[row.context_id];
        const verdict = mine ? VERDICT[mine.verdict] : null;
        // Scored in this session but not yet re-fetched from the server.
        const justReviewed = !mine && reviewedIds.has(row.context_id);
        const isEmail = row.channel === "email";
        const isSkip = row.message_type === "skip";
        const open = expanded.has(row.context_id);

        if (isSkip) {
          // Still a button: a skip is reviewable, so selecting it must work.
          return (
            <div key={item.key} className="flex justify-center">
              <button
                type="button"
                onClick={() => onSelect(row.context_id)}
                aria-current={selected}
                aria-label={`Review the skipped reply from ${formatEt(item.at)}`}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-1.5 text-center text-xs text-slate-600 transition dark:text-slate-300",
                  "bg-slate-100 dark:bg-slate-800",
                  selected
                    ? "ring-2 ring-navy-500 dark:ring-navy-300"
                    : "hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600",
                )}
              >
                Bot didn&apos;t reply · {skipReasonLabel(row.skip_reason)}
                <span className="text-slate-400"> · {formatEt(item.at)}</span>
                {selected ? (
                  <span className="font-semibold text-navy-700 dark:text-navy-200"> · Reviewing this</span>
                ) : verdict ? (
                  <span className={cn("font-semibold", verdict.className)}> · {verdict.label}</span>
                ) : justReviewed ? (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400"> · Reviewed</span>
                ) : null}
              </button>
            </div>
          );
        }

        return (
          <div key={item.key} className="flex justify-end">
            <div className={cn(isEmail ? "w-[92%] sm:w-[85%]" : "max-w-[88%] sm:max-w-[78%]")}>
              <Meta>
                <span className="inline-flex flex-wrap items-center gap-x-1.5">
                  <span>
                    {row.workflow_code ? `Bot · nurture ${row.workflow_code}` : "Bot"} · {formatEt(item.at)}
                  </span>
                  {selected ? (
                    <span className="font-semibold text-navy-700 dark:text-navy-200">· Reviewing this message</span>
                  ) : verdict ? (
                    <span className={cn("inline-flex items-center gap-0.5 font-semibold", verdict.className)}>
                      · <Check className="h-3 w-3" /> {verdict.label}
                    </span>
                  ) : justReviewed ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">· Reviewed</span>
                  ) : null}
                </span>
              </Meta>
              {item.replyingTo && (
                <p className="mb-1 line-clamp-2 break-words text-[11px] italic text-slate-500 dark:text-slate-400">
                  Replying to: “{item.replyingTo}”
                </p>
              )}

              {/* The whole message is the click target: a reviewer reads it,
                  decides it is the one, and clicks where they are already
                  looking. Selecting is not the same as scoring — the verdict
                  buttons below are still the only thing that records one. */}
              <button
                type="button"
                onClick={() => onSelect(row.context_id)}
                aria-current={selected}
                aria-label={`Review the message sent ${formatEt(item.at)}`}
                className={cn(
                  "w-full rounded-xl bg-navy-50 px-3 py-2 text-left text-sm leading-relaxed text-navy-900 transition dark:bg-navy-900 dark:text-navy-50",
                  selected
                    ? "border-2 border-navy-500 dark:border-navy-300"
                    : "hover:ring-2 hover:ring-navy-300 dark:hover:ring-navy-600",
                )}
              >
                <span
                  className={cn(
                    "block whitespace-pre-wrap break-words",
                    isEmail && !open && "max-h-[132px] overflow-hidden",
                  )}
                >
                  {row.reply_text ?? <span className="italic text-slate-400">(no text recorded)</span>}
                </span>
              </button>

              {isEmail && (
                <button
                  type="button"
                  onClick={() => toggle(row.context_id)}
                  className="mt-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
                >
                  {open ? "Show less" : "Show full email"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
