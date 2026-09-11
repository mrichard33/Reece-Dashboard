"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatEt } from "@/lib/botReview/core";
import type { ThreadTurn } from "@/lib/queries/botReview";

/**
 * The conversation as the bot saw it, from the fingerprint's input_snapshot.
 *
 * Four bubble variants, per the design:
 *   lead              slate, left
 *   bot               light navy, right
 *   bot-under-review  navy border + "Reviewing this message"
 *   bot-silent        dashed rose — "No reply sent · Reason: …"
 * plus an email card with a clamped body and a "Show full email" toggle.
 *
 * The message under review is rendered from the queue row, not from the
 * snapshot thread: the snapshot is the INPUT the bot had, so the reply it then
 * produced is not in it.
 */

export type UnderReview = {
  kind: "reply" | "skip" | "nurture";
  text: string | null;
  skipReason: string | null;
  at: string | null;
  channel: string | null;
  workflowCode: string | null;
  subject: string | null;
};

function Bubble({
  side,
  who,
  at,
  children,
  className,
}: {
  side: "left" | "right";
  who: string;
  at: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex", side === "left" ? "justify-start" : "justify-end")}>
      <div className="max-w-[78%]">
        <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
          {who}
          {at ? ` · ${formatEt(at)}` : ""}
        </p>
        <div className={cn("rounded-xl px-3 py-2 text-sm leading-relaxed", className)}>{children}</div>
      </div>
    </div>
  );
}

export function ConversationThread({
  turns,
  underReview,
  leadLabel,
}: {
  turns: ThreadTurn[];
  underReview: UnderReview;
  leadLabel: string;
}) {
  const [showFullEmail, setShowFullEmail] = useState(false);
  const isEmail = underReview.channel === "email";

  return (
    <div className="flex flex-col gap-3">
      {turns.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No thread was captured for this message.
        </p>
      )}

      {turns.map((t, i) => {
        const inbound = t.direction === "inbound";
        return (
          <Bubble
            key={`${t.at ?? i}-${i}`}
            side={inbound ? "left" : "right"}
            who={inbound ? leadLabel : "Bot"}
            at={t.at}
            className={
              inbound
                ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                : "bg-navy-50 text-navy-900 dark:bg-navy-900 dark:text-navy-50"
            }
          >
            {t.body ?? <span className="italic text-slate-400">(empty)</span>}
          </Bubble>
        );
      })}

      {/* The message being reviewed. */}
      {underReview.kind === "skip" ? (
        <Bubble
          side="right"
          who={`Bot · ${formatEt(underReview.at)} · Reviewing this message`}
          at={null}
          className="border border-dashed border-rose-400 bg-rose-50/60 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <p className="font-medium">
            No reply sent · Reason: {underReview.skipReason ?? "not recorded"}
          </p>
        </Bubble>
      ) : isEmail ? (
        <div className="flex justify-end">
          <div className="w-[85%]">
            <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
              {underReview.workflowCode ? `Bot · nurture ${underReview.workflowCode}` : "Bot"} ·{" "}
              {formatEt(underReview.at)} · Reviewing this message
            </p>
            <div className="rounded-xl border-2 border-navy-500 bg-white p-3 dark:bg-slate-900">
              {underReview.subject && (
                <p className="text-sm font-semibold text-navy-900 dark:text-white">{underReview.subject}</p>
              )}
              <div
                className={cn(
                  "mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200",
                  !showFullEmail && "max-h-[132px] overflow-hidden",
                )}
              >
                {underReview.text ?? ""}
              </div>
              <button
                type="button"
                onClick={() => setShowFullEmail((v) => !v)}
                className="mt-2 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
              >
                {showFullEmail ? "Show less" : "Show full email"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Bubble
          side="right"
          who={`Bot · ${formatEt(underReview.at)} · Reviewing this message`}
          at={null}
          className="border-2 border-navy-500 bg-navy-50 text-navy-900 dark:bg-navy-900 dark:text-navy-50"
        >
          {underReview.text ?? <span className="italic text-slate-400">(no text recorded)</span>}
        </Bubble>
      )}
    </div>
  );
}
