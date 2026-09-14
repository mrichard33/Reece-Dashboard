"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { VerdictButtons } from "./VerdictButtons";
import {
  validateDraft,
  showsReasons,
  reasonsForType,
  emptyDraft,
  type FeedbackDraft,
  type MessageType,
  type Verdict,
  type ValidationError,
} from "@/lib/botReview/core";
import type { Reason } from "@/lib/queries/botReview";

/**
 * The feedback form — verdict, reasons, rewrite, note, toggles, submit.
 *
 * Behaviour the design pins down and this implements:
 *   · G / N / U set the verdict from anywhere on the screen; Enter submits once
 *     a verdict is set. Both are ignored while a text field has focus, or the
 *     reviewer could never type the letter "g" into a note.
 *   · Reason chips appear only after Needs work or Unsafe.
 *   · Errors sit UNDER the control they belong to, never as a banner.
 *   · The teaching-example checkbox is enabled only on Good.
 *   · "Submit and next" is the only primary button on the screen.
 *
 * Increment 2 (§6B, §6C, §6D):
 *   · The "I've seen this before" toggle is GONE. The nightly Phase 2 grouping
 *     counts recurrence itself, from every review at once — the toggle asked a
 *     reviewer to do that from memory, with worse information.
 *   · "Save as a gold example" is now "Teach the bot to reply like this". Same
 *     column, words someone can act on.
 *   · Two ways past a message without scoring it, both persistent and both
 *     undoable from Completed: Skip (this message, one click, sits under the
 *     verdicts) and Nothing to review here (the whole conversation).
 *   · A message already carrying your review offers Edit review and Remove
 *     review side by side.
 */

export function FeedbackPanel({
  messageType,
  originalText,
  reasons,
  readOnly,
  existingVerdict,
  canDismissConversation,
  canRemoveReview,
  onSubmit,
  onSkipMessage,
  onDismiss,
  onRetract,
  submitting,
}: {
  messageType: MessageType;
  originalText: string | null;
  reasons: Reason[];
  readOnly: boolean;
  existingVerdict?: { verdict: string; reasonCodes: string[]; note: string | null; gold: boolean; at: string } | null;
  canDismissConversation: boolean;
  canRemoveReview: boolean;
  onSubmit: (draft: FeedbackDraft) => void | Promise<void>;
  onSkipMessage: () => void;
  onDismiss: (scope: "message" | "conversation") => void;
  onRetract: () => void;
  submitting: boolean;
}) {
  const [draft, setDraft] = useState<FeedbackDraft>({ ...emptyDraft, betterText: originalText ?? "" });
  const [error, setError] = useState<ValidationError | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [editing, setEditing] = useState(!readOnly);
  const noteRef = useRef<HTMLInputElement>(null);
  const rewriteRef = useRef<HTMLTextAreaElement>(null);
  const [, startTransition] = useTransition();

  // NOTE: there is deliberately no "reset on new message" effect here.
  // ReviewWorkspace mounts this with key={context_id}, so moving to another
  // message remounts the panel and the state starts clean. Resetting inside an
  // effect instead would cascade an extra render on every selection — and is
  // what react-hooks/set-state-in-effect exists to catch.

  const visibleReasons = reasonsForType(reasons, messageType);
  const disabled = !editing || submitting;

  function setVerdict(v: Verdict) {
    setDraft((d) => ({ ...d, verdict: v, gold: v === "good" ? d.gold : false }));
    setError(null);
  }

  function toggleReason(code: string) {
    setDraft((d) => ({
      ...d,
      // Selection order is preserved — the Phase 2 clustering reports on it.
      reasonCodes: d.reasonCodes.includes(code)
        ? d.reasonCodes.filter((c) => c !== code)
        : [...d.reasonCodes, code],
    }));
    setError(null);
  }

  function attemptSubmit() {
    const invalid = validateDraft(draft);
    if (invalid) {
      setError(invalid);
      // Put the cursor on the thing that is wrong rather than making them hunt.
      if (invalid.field === "note") noteRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(() => void onSubmit(draft));
  }

  // Screen-wide shortcuts. Ignored while typing, and while the form is locked.
  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (typing) {
        // Enter still submits from the note field; everything else is typing.
        if (e.key === "Enter" && el?.tagName === "INPUT") {
          e.preventDefault();
          attemptSubmit();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "g") { e.preventDefault(); setVerdict("good"); }
      else if (k === "n") { e.preventDefault(); setVerdict("needs_work"); }
      else if (k === "u") { e.preventDefault(); setVerdict("unsafe"); }
      // S sets the message aside. No verdict, no reason, no note — nothing is
      // being scored, so validateDraft has nothing to say about it.
      else if (k === "s") { e.preventDefault(); onSkipMessage(); }
      else if (k === "e") { e.preventDefault(); rewriteRef.current?.focus(); }
      else if (e.key === "Enter") { e.preventDefault(); attemptSubmit(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (readOnly && !editing) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reviewed by you · {existingVerdict?.at ?? ""}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-navy-900 dark:text-white">
              {existingVerdict?.verdict === "good" && <span className="text-emerald-600">Good</span>}
              {existingVerdict?.verdict === "needs_work" && <span className="text-amber-600">Needs work</span>}
              {existingVerdict?.verdict === "unsafe" && <span className="text-rose-600">Unsafe</span>}
              {existingVerdict?.gold && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
                  ⭐ Teaching example
                </span>
              )}
            </p>
            {existingVerdict?.note && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Note: {existingVerdict.note}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-navy-700 hover:underline dark:text-navy-200"
            >
              Edit review
            </button>
            {/* Remove is a link, not a button: it is rarer than Edit and must
                never be the thing a tired reviewer hits by muscle memory. */}
            {canRemoveReview && (
              <button
                type="button"
                onClick={onRetract}
                className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-400"
              >
                Remove review
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2 text-sm font-semibold text-navy-900 dark:text-white">How was this message?</p>
      <VerdictButtons value={draft.verdict} onChange={setVerdict} disabled={disabled} />
      {error?.field === "verdict" && <FieldError>{error.message}</FieldError>}

      {/* Skip sits with the verdicts because that is where the decision is
          made — but lighter than them, because it is not a fourth verdict.
          A skip is the ABSENCE of a score: it writes no bot_feedback row and
          moves neither the Good rate nor anyone's reviewer count. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Button variant="ghost" size="sm" onClick={onSkipMessage} disabled={disabled}>
          Skip (S)
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400">Don&apos;t score this one.</span>
      </div>

      {showsReasons(draft.verdict) && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-navy-900 dark:text-white">
            What went wrong?{" "}
            <span className="font-normal text-slate-500 dark:text-slate-400">Pick at least one.</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleReasons.map((r) => {
              const on = draft.reasonCodes.includes(r.code);
              return (
                <button
                  key={r.code}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => toggleReason(r.code)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition",
                    on
                      ? "bg-navy-700 text-white ring-navy-700"
                      : "bg-white text-slate-700 ring-slate-300 hover:ring-navy-400 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {error?.field === "reason_codes" && <FieldError>{error.message}</FieldError>}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold text-navy-900 dark:text-white">
            Better version{" "}
            <span className="font-normal text-slate-500 dark:text-slate-400">optional</span>
          </p>
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            className="text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
          >
            {showDiff ? "Show changes · on" : "Show changes"}
          </button>
        </div>
        {showDiff && originalText ? (
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Bot said</p>
            <p className="whitespace-pre-wrap text-rose-700 line-through dark:text-rose-300">{originalText}</p>
            <p className="mb-1 mt-2 text-[11px] uppercase tracking-wide text-slate-500">Better</p>
            <p className="whitespace-pre-wrap text-emerald-700 dark:text-emerald-300">{draft.betterText}</p>
          </div>
        ) : (
          <textarea
            ref={rewriteRef}
            rows={3}
            disabled={disabled}
            value={draft.betterText}
            onChange={(e) => setDraft((d) => ({ ...d, betterText: e.target.value }))}
            placeholder={
              messageType === "skip"
                ? "What should the bot have said?"
                : "Rewrite the message the way it should have read."
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-sm font-semibold text-navy-900 dark:text-white">
          Note{" "}
          <span
            className={cn(
              "font-normal",
              draft.verdict === "unsafe" ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400",
            )}
          >
            {draft.verdict === "unsafe" ? "required" : "optional"}
          </span>
        </p>
        <input
          ref={noteRef}
          type="text"
          disabled={disabled}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          placeholder={draft.verdict === "unsafe" ? "Tell us what could go wrong." : "Add a note for the next reviewer."}
          className={cn(
            "w-full rounded-lg border bg-white px-2.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 disabled:opacity-60 dark:bg-slate-950 dark:text-slate-100",
            error?.field === "note"
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
              : "border-slate-300 focus:border-navy-500 focus:ring-navy-500 dark:border-slate-700",
          )}
        />
        {error?.field === "note" && <FieldError>{error.message}</FieldError>}
      </div>

      <div className="mt-3">
        <label
          className={cn(
            "flex items-start gap-2 text-xs",
            draft.verdict === "good"
              ? "text-slate-600 dark:text-slate-300"
              : "cursor-not-allowed text-slate-400 dark:text-slate-600",
          )}
          title={draft.verdict === "good" ? undefined : "Good messages only"}
        >
          <input
            type="checkbox"
            disabled={disabled || draft.verdict !== "good"}
            checked={draft.gold}
            onChange={(e) => setDraft((d) => ({ ...d, gold: e.target.checked }))}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
          />
          <span>
            <span className="font-medium">⭐ Teach the bot to reply like this</span>
            {draft.verdict !== "good" && " · Good messages only"}
            <span className="block text-slate-500 dark:text-slate-400">
              Saves this as an example the bot can learn from. Nothing changes until it&apos;s approved.
            </span>
          </span>
        </label>
        {error?.field === "gold" && <FieldError>{error.message}</FieldError>}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {/* The wider "not now". Skip above handles this one message; this is
            the whole thread, which is why it keeps its confirm step. The old
            session-only "Skip for now" is gone — it recorded nothing, and two
            buttons named Skip meaning different things is how a reviewer ends
            up using the wrong one. */}
        <DismissMenu
          disabled={submitting}
          canDismissConversation={canDismissConversation}
          onDismiss={onDismiss}
        />
        <Button variant="primary" size="sm" onClick={attemptSubmit} disabled={disabled}>
          {submitting ? "Saving…" : "Submit and next →"}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Nothing to review here" with its scope picker.
 *
 * The scope is chosen BEFORE the confirm rather than inside it, because the two
 * choices have very different blast radii — one message versus every message to
 * this lead — and burying that in a modal makes the wider one too easy to pick
 * by accident.
 */
function DismissMenu({
  disabled,
  canDismissConversation,
  onDismiss,
}: {
  disabled: boolean;
  canDismissConversation: boolean;
  onDismiss: (scope: "message" | "conversation") => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick() {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} disabled={disabled}>
        Nothing to review here ▾
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-20 mb-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDismiss("message");
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            This message
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canDismissConversation}
            title={canDismissConversation ? undefined : "This message has no lead record to group by."}
            onClick={() => {
              setOpen(false);
              onDismiss("conversation");
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
          >
            This whole conversation
          </button>
        </div>
      )}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
      {children}
    </p>
  );
}
