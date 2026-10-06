"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { timeEt, type ConvItem, type ConversationView, type Issue } from "@/lib/botReview/conversation";
import type { QueueRow } from "@/lib/queries/botReview";

/**
 * The real conversation, in order, new system only (2026-10-06).
 *
 * Built by buildConversation from the HL messages mirror: what the lead said,
 * what the bot sent (matched to its bot_message_context row), what a workflow
 * or a person sent, and quiet one-line events for the moments the bot was
 * paused, stopped, turned back on or the lead opted out. There are no fake
 * "Bot" activity bubbles and no red "No reply sent" bubbles any more: a skip is
 * a grey line, because the bot did not speak.
 *
 * Every bot bubble carries 👍 / 👎. 👍 saves a Good review straight away (the
 * same submitFeedback, with the undo toast); 👎 opens the review panel on that
 * message with Needs work picked.
 */

export type MyVerdict = "good" | "needs_work" | "unsafe";

const VERDICT_LABEL: Record<MyVerdict, string> = { good: "Good", needs_work: "Needs work", unsafe: "Unsafe" };

/*
 * Chips differ in lightness, not only hue: amber is a light chip with dark
 * text, rose is a dark chip with white text, so they read apart in grayscale.
 */
function IssueChip({ issue }: { issue: Issue }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        issue.tone === "rose"
          ? "bg-rose-700 text-white dark:bg-rose-600"
          : "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
      )}
    >
      {issue.label}
    </span>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] text-slate-600 dark:text-slate-400">{children}</p>;
}

/** The first line of an email, then the rest behind "Show full email". */
function EmailBody({ body, open }: { body: string; open: boolean }) {
  const text = body.trim();
  const firstLine = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  return <span className="block whitespace-pre-wrap break-words">{open ? text : firstLine || "(empty)"}</span>;
}

export function ConversationThread({
  view,
  rows,
  selectedId,
  myVerdicts,
  leadLabel,
  onSelect,
  onThumbsUp,
  onThumbsDown,
  canReview,
}: {
  view: ConversationView;
  rows: QueueRow[];
  selectedId: number | null;
  /** This reviewer's verdict per context id, from the server or this session. */
  myVerdicts: Record<number, MyVerdict>;
  leadLabel: string;
  onSelect: (contextId: number) => void;
  onThumbsUp: (contextId: number) => void;
  onThumbsDown: (contextId: number) => void;
  canReview: boolean;
}) {
  const [openEmails, setOpenEmails] = useState<Set<string>>(new Set());
  const byId = new Map(rows.map((r) => [r.context_id, r]));

  function toggleEmail(key: string) {
    setOpenEmails((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasMessages = view.items.some((i) => i.kind === "lead" || i.kind === "bot" || i.kind === "other_outbound");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-[11px] text-slate-600 dark:text-slate-400">{view.notice}</p>

      {!hasMessages && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
          No messages for this lead since the new system started.
        </p>
      )}

      {view.items.map((item) => (
        <Item
          key={item.key}
          item={item}
          row={item.kind === "bot" ? byId.get(item.contextId) : undefined}
          selectedId={selectedId}
          myVerdicts={myVerdicts}
          leadLabel={leadLabel}
          emailOpen={openEmails.has(item.key)}
          onToggleEmail={() => toggleEmail(item.key)}
          onSelect={onSelect}
          onThumbsUp={onThumbsUp}
          onThumbsDown={onThumbsDown}
          canReview={canReview}
        />
      ))}
    </div>
  );
}

function Item({
  item,
  row,
  selectedId,
  myVerdicts,
  leadLabel,
  emailOpen,
  onToggleEmail,
  onSelect,
  onThumbsUp,
  onThumbsDown,
  canReview,
}: {
  item: ConvItem;
  row: QueueRow | undefined;
  selectedId: number | null;
  myVerdicts: Record<number, MyVerdict>;
  leadLabel: string;
  emailOpen: boolean;
  onToggleEmail: () => void;
  onSelect: (contextId: number) => void;
  onThumbsUp: (contextId: number) => void;
  onThumbsDown: (contextId: number) => void;
  canReview: boolean;
}) {
  if (item.kind === "day") {
    return (
      <div className="flex items-center gap-2 pt-1" role="separator" aria-label={item.label}>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{item.label}</span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (item.kind === "session") {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300">
        <span>{item.label}</span>
        <span className="font-normal text-slate-600 dark:text-slate-400">
          · {item.count} message{item.count === 1 ? "" : "s"} · {timeEt(item.startAt)}
        </span>
      </p>
    );
  }

  if (item.kind === "event") {
    const text = (
      <>
        {item.text}
        <span className="text-slate-500 dark:text-slate-400"> · {timeEt(item.at)}</span>
      </>
    );
    const cls = cn(
      "max-w-[92%] text-center text-xs",
      item.tone === "rose" ? "font-semibold text-rose-800 dark:text-rose-300" : "text-slate-600 dark:text-slate-300",
    );
    if (item.contextId == null) {
      return (
        <div className="flex justify-center">
          <p className={cls}>{text}</p>
        </div>
      );
    }
    // A skip is reviewable, so its line is still a button.
    const selected = item.contextId === selectedId;
    const mine = myVerdicts[item.contextId];
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => onSelect(item.contextId!)}
          aria-current={selected}
          aria-label={`Review the skipped reply from ${timeEt(item.at)}`}
          className={cn(
            cls,
            "rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800",
            selected ? "ring-2 ring-navy-500 dark:ring-navy-300" : "hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-600",
          )}
        >
          {text}
          {selected ? (
            <span className="font-semibold text-navy-700 dark:text-navy-200"> · Reviewing this</span>
          ) : mine ? (
            <span className="font-semibold"> · You: {VERDICT_LABEL[mine]}</span>
          ) : null}
        </button>
      </div>
    );
  }

  if (item.kind === "lead") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%] sm:max-w-[78%]">
          <Meta>
            {leadLabel} · {item.channelLabel} · {timeEt(item.at)}
          </Meta>
          <div className="whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            {/* No text: usually a photo, which the mirror does not keep. */}
            {item.body.trim() || <span className="italic text-slate-600 dark:text-slate-400">(no text, may be a photo)</span>}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === "other_outbound") {
    return (
      <div id={item.anchor} className="flex scroll-mt-4 justify-end">
        <div className={cn(item.isEmail ? "w-[92%] sm:w-[85%]" : "max-w-[88%] sm:max-w-[78%]")}>
          <Meta>
            Workflow or team · {item.channelLabel} · {timeEt(item.at)}
          </Meta>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {item.isEmail ? (
              <EmailBody body={item.body} open={emailOpen} />
            ) : (
              <span className="block whitespace-pre-wrap break-words">{item.body.trim() || "(empty)"}</span>
            )}
          </div>
          {item.isEmail && (
            <button
              type="button"
              onClick={onToggleEmail}
              className="mt-1 py-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
            >
              {emailOpen ? "Show less" : "Show full email"}
            </button>
          )}
          {item.issues.length > 0 && (
            <p className="mt-1 flex flex-wrap justify-end gap-1">
              {item.issues.map((x) => (
                <IssueChip key={x.label} issue={x} />
              ))}
            </p>
          )}
        </div>
      </div>
    );
  }

  // A bot message.
  const selected = item.contextId === selectedId;
  const mine = myVerdicts[item.contextId];
  const ruleName = row?.workflow_code ? `nurture ${row.workflow_code}` : null;

  return (
    <div id={item.anchor} className="flex scroll-mt-4 justify-end">
      <div className={cn(item.isEmail ? "w-[92%] sm:w-[85%]" : "max-w-[88%] sm:max-w-[78%]")}>
        <Meta>
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <span>
              Bot{ruleName ? ` · ${ruleName}` : ""} · {item.channelLabel} · {timeEt(item.at)}
            </span>
            {item.notSent && <span className="font-semibold">· Not sent</span>}
            {selected && <span className="font-semibold text-navy-700 dark:text-navy-200">· Reviewing this message</span>}
          </span>
        </Meta>

        {/* The whole bubble selects the message. Selecting is not scoring:
            only the thumbs and the review panel record a verdict. */}
        <button
          type="button"
          onClick={() => onSelect(item.contextId)}
          aria-current={selected}
          aria-label={`Review the bot message sent ${timeEt(item.at)}`}
          className={cn(
            "w-full rounded-xl bg-navy-50 px-3 py-2 text-left text-sm leading-relaxed text-navy-900 transition dark:bg-navy-900 dark:text-navy-50",
            selected ? "ring-2 ring-navy-600 dark:ring-navy-300" : "hover:ring-2 hover:ring-navy-300 dark:hover:ring-navy-600",
          )}
        >
          {item.isEmail ? (
            <EmailBody body={item.body} open={emailOpen} />
          ) : (
            <span className="block whitespace-pre-wrap break-words">
              {item.body.trim() || <span className="italic text-slate-500">(no text recorded)</span>}
            </span>
          )}
        </button>

        {selected && item.replyingTo && (
          <p className="mt-1 break-words text-[11px] italic text-slate-600 dark:text-slate-400">
            Replying to “{item.replyingTo}”
          </p>
        )}
        {!item.matched && !item.notSent && (
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            From the bot&apos;s record. This text was not found in the GHL messages.
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-1 gap-y-1">
          {item.issues.map((x) => (
            <IssueChip key={x.label} issue={x} />
          ))}
          {item.isEmail && (
            <button
              type="button"
              onClick={onToggleEmail}
              className="py-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
            >
              {emailOpen ? "Show less" : "Show full email"}
            </button>
          )}
          {mine ? (
            <span className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">You: {VERDICT_LABEL[mine]}</span>
          ) : canReview ? (
            <span className="inline-flex items-center">
              <ThumbButton label="Good message" onClick={() => onThumbsUp(item.contextId)}>
                <ThumbsUp className="h-4 w-4" aria-hidden />
              </ThumbButton>
              <ThumbButton label="Needs work" onClick={() => onThumbsDown(item.contextId)}>
                <ThumbsDown className="h-4 w-4" aria-hidden />
              </ThumbButton>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A 36 px circle inside a 44 px hit area. */
function ThumbButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="group inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition group-hover:border-navy-500 group-hover:text-navy-800 group-focus-visible:ring-2 group-focus-visible:ring-navy-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
        {children}
      </span>
    </button>
  );
}
