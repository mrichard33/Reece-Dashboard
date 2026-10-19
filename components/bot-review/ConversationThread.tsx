"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  collapsedSessionLine,
  defaultOpenSessions,
  timeEt,
  toSessionBlocks,
  type ConvItem,
  type ConversationView,
  type Issue,
} from "@/lib/botReview/conversation";
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

/*
 * 2026-10-07 — a Why-card Jump can point at a message inside a collapsed
 * session, which is not in the DOM. The card asks the thread instead: the
 * thread opens that session, then scrolls the message into view.
 */
const JUMP_EVENT = "bot-review:jump";

export function requestJump(anchor: string) {
  if (typeof window === "undefined" || !anchor) return;
  window.dispatchEvent(new CustomEvent<string>(JUMP_EVENT, { detail: anchor }));
}

/** Scroll `el` to the middle of the thread's own scroll box; never the page. */
function centerInThreadBox(el: HTMLElement, { onlyIfHidden, smooth }: { onlyIfHidden: boolean; smooth: boolean }): boolean {
  const box = el.closest<HTMLElement>("[data-thread-scroll]");
  if (!box || box.scrollHeight <= box.clientHeight + 1) return false;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (onlyIfHidden && r.top >= b.top && r.bottom <= b.bottom) return true;
  const target = box.scrollTop + (r.top - b.top) - (box.clientHeight - r.height) / 2;
  box.scrollTo({ top: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
  return true;
}

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
          ? "bg-brick-700 text-white dark:bg-brick-600"
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

/**
 * The box the thread scrolls in (2026-10-07, Revin pattern). At lg+ it fills
 * what is left of the middle column (flex-1, min-h-0) and scrolls on its own
 * (overflow-y-auto, a visible scrollbar from .thread-scroll); below lg it is a
 * plain stacked box and the page scrolls. `data-thread-scroll` is how the
 * thread finds it to centre a message without moving the page.
 */
export function ThreadScrollBox({ pending, children }: { pending: boolean; children?: React.ReactNode }) {
  return (
    <div
      aria-busy={pending}
      data-thread-scroll=""
      className={`thread-scroll min-h-0 rounded-xl border border-slate-200 bg-white p-3 transition-opacity dark:border-slate-800 dark:bg-slate-900 lg:flex-1 lg:overflow-y-auto${
        pending ? " opacity-60" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function ConversationThread({
  view,
  rows,
  selectedId,
  contactKey,
  myVerdicts,
  leadLabel,
  onSelect,
  onThumbsUp,
  onThumbsDown,
  canReview,
}: {
  view: ConversationView;
  /** Whose thread this is; the open/closed sessions are remembered per contact. */
  contactKey: string;
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

  /*
   * Sessions collapse (2026-10-07). A long thread is mostly sessions nobody
   * needs for this review: the one holding the selected message and its two
   * neighbours start open, the rest are one line each. A reviewer's own
   * open/close choices are kept per contact, in component state only.
   */
  const blocks = useMemo(() => toSessionBlocks(view.items), [view.items]);
  const selectedAnchor = useMemo(() => {
    if (selectedId == null) return null;
    const hit = view.items.find(
      (i) => (i.kind === "bot" && i.contextId === selectedId) || (i.kind === "event" && i.contextId === selectedId),
    );
    if (!hit) return null;
    return hit.kind === "bot" ? hit.anchor : `skip-c${selectedId}`;
  }, [view.items, selectedId]);
  const defaults = useMemo(() => defaultOpenSessions(blocks, selectedAnchor), [blocks, selectedAnchor]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean>>>({});
  const mine = overrides[contactKey] ?? {};
  const isOpen = (key: string) => mine[key] ?? defaults.has(key);
  function setOpen(key: string, open: boolean) {
    setOverrides((o) => ({ ...o, [contactKey]: { ...(o[contactKey] ?? {}), [key]: open } }));
  }

  // Where to scroll after the next render: the selected message when the
  // thread loads or the selection moves, or a Why-card Jump.
  const pending = useRef<{ anchor: string; onlyIfHidden: boolean; smooth: boolean } | null>(null);
  useEffect(() => {
    if (selectedAnchor) pending.current = { anchor: selectedAnchor, onlyIfHidden: true, smooth: false };
  }, [selectedAnchor, contactKey]);
  useEffect(() => {
    function onJump(e: Event) {
      const anchor = (e as CustomEvent<string>).detail;
      const block = blocks.find((b) => b.kind === "session" && b.anchors.includes(anchor));
      if (block && block.kind === "session" && !isOpen(block.header.key)) setOpen(block.header.key, true);
      pending.current = { anchor, onlyIfHidden: false, smooth: true };
      // When nothing needs to open, there is no re-render to wait for.
      requestAnimationFrame(() => flushScroll());
    }
    window.addEventListener(JUMP_EVENT, onJump);
    return () => window.removeEventListener(JUMP_EVENT, onJump);
  });
  function flushScroll() {
    const p = pending.current;
    if (!p) return;
    const el = document.getElementById(p.anchor);
    if (!el) return;
    pending.current = null;
    // Inside the thread's own box at lg+; below lg the page scrolls (Jump only).
    if (!centerInThreadBox(el, p) && !p.onlyIfHidden) el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
  useEffect(() => {
    flushScroll();
  });

  const renderItem = (item: ConvItem) => (
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
  );

  // 2026-10-12: gap-2 between messages (was gap-3) so a 1080p screen shows
  // eight or more bubbles with the Why card collapsed.
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-[11px] text-slate-600 dark:text-slate-400">{view.notice}</p>

      {!hasMessages && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
          No messages for this lead since the new system started.
        </p>
      )}

      {blocks.map((b) => {
        if (b.kind === "item") return renderItem(b.item);
        const open = isOpen(b.header.key);
        const bodyId = `sess-${b.header.key}`;
        return (
          <div key={b.header.key} className="flex flex-col gap-2">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen(b.header.key, !open)}
              className="flex min-h-8 w-full items-center gap-1.5 border-t border-slate-100 pt-2 text-left text-[11px] font-semibold text-slate-700 hover:text-navy-800 dark:border-slate-800 dark:text-slate-300 dark:hover:text-navy-100"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {open ? (
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                  <span>{b.header.label}</span>
                  <span className="font-normal text-slate-600 dark:text-slate-400">
                    · {b.header.count} message{b.header.count === 1 ? "" : "s"} · {timeEt(b.header.startAt)}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 break-words font-normal text-slate-600 dark:text-slate-400">
                  {collapsedSessionLine(b)}
                </span>
              )}
            </button>
            {open && (
              <div id={bodyId} className="flex flex-col gap-2">
                {b.items.map(renderItem)}
              </div>
            )}
          </div>
        );
      })}
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
      item.tone === "rose" ? "font-semibold text-brick-800 dark:text-brick-300" : "text-slate-600 dark:text-slate-300",
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
      <div id={`skip-c${item.contextId}`} className="flex scroll-mt-4 justify-center">
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

        {/* 2026-10-12: -mb-1.5 lets the 44 px thumb hit area use the gap below
            it instead of adding to it; the thumbs themselves are unchanged. */}
        <div className="-mb-1.5 mt-0.5 flex flex-wrap items-center justify-end gap-x-1 gap-y-1">
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
