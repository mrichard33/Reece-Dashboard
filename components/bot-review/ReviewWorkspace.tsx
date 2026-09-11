"use client";

import { useCallback, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QueueList } from "./QueueList";
import { ContextStrip } from "./ContextStrip";
import { ConversationThread, type UnderReview } from "./ConversationThread";
import { FeedbackPanel } from "./FeedbackPanel";
import { UndoToast, StopBotModal } from "./Overlays";
import { submitFeedback, editFeedback, undoFeedback, stopBotForLead } from "@/lib/actions/botReview";
import { formatEt, contactLabel, contactNameOnly, type FeedbackDraft, type MessageType } from "@/lib/botReview/core";
import type { QueueRow, MyFeedback, Reason, ThreadTurn } from "@/lib/queries/botReview";

/**
 * The Review tab's client shell.
 *
 * The queue and the selected message are server-rendered; this owns only what
 * has to be interactive — selection, the form, the toast and the modal. The
 * selection lives in the URL (`?ctx=`) so the server can render the right
 * message and a reviewer can share the link to one.
 *
 * Submitting is optimistic in the way that matters: the toast appears
 * immediately and the queue advances, because the reviewer's next action is
 * always the next message. A failure replaces the toast with the error and
 * leaves the form as it was — nothing is silently lost.
 */

export function ReviewWorkspace({
  rows,
  total,
  page,
  selected,
  thread,
  myFeedback,
  reasons,
  canStopBot,
}: {
  rows: QueueRow[];
  total: number;
  page: number;
  selected: QueueRow | null;
  thread: ThreadTurn[];
  myFeedback: MyFeedback | null;
  reasons: Reason[];
  canStopBot: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; detail?: string; id: number | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(new Set());

  const go = useCallback(
    (params: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(params)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.push(`${pathname}?${next.toString()}` as Route);
    },
    [pathname, router, sp],
  );

  const selectRow = useCallback((contextId: number) => go({ ctx: String(contextId) }), [go]);

  /** The next unreviewed row after the current one — where "and next" goes. */
  function advance(fromId: number) {
    const i = rows.findIndex((r) => r.context_id === fromId);
    const after = rows.slice(i + 1).find((r) => r.review_count === 0 && !reviewedIds.has(r.context_id));
    const fallback = rows.find((r) => r.review_count === 0 && !reviewedIds.has(r.context_id) && r.context_id !== fromId);
    const next = after ?? fallback;
    if (next) selectRow(next.context_id);
    else go({ ctx: null });
  }

  async function onSubmit(draft: FeedbackDraft) {
    if (!selected) return;
    setSubmitting(true);
    setErrorMsg(null);

    const original = selected.reply_text;
    const res = myFeedback
      ? await editFeedback({ id: myFeedback.id, originalText: original, draft })
      : await submitFeedback({
          messageType: selected.message_type as MessageType,
          messageRef: selected.message_ref,
          originalText: original,
          draft,
        });

    setSubmitting(false);

    if (!res.ok) {
      setErrorMsg(res.error);
      return;
    }

    const verdictLabel =
      draft.verdict === "good" ? "Good" : draft.verdict === "needs_work" ? "Needs work" : "Unsafe";
    setReviewedIds((s) => new Set(s).add(selected.context_id));
    setToast({
      message: `Saved · ${verdictLabel}`,
      detail: res.data.uncalibrated
        ? "Stored, but it won't count until you're calibrated."
        : `${contactLabel(selected)} · ${formatEt(selected.generated_at)} message`,
      id: res.data.id,
    });
    advance(selected.context_id);
  }

  async function onUndo() {
    if (!toast?.id) return;
    const res = await undoFeedback(toast.id);
    setToast(null);
    if (!res.ok) setErrorMsg(res.error ?? "Could not undo.");
    else router.refresh();
  }

  async function onConfirmStop() {
    if (!selected?.ghl_contact_id) return;
    setStopBusy(true);
    const res = await stopBotForLead(selected.ghl_contact_id, "Stopped from Bot Review");
    setStopBusy(false);
    setStopOpen(false);
    if (!res.ok) {
      setErrorMsg(res.error ?? "Could not stop the bot.");
      return;
    }
    setToast({
      message: res.alreadyStopped
        ? `Bot was already stopped for ${contactNameOnly(selected)}`
        : `Bot stopped for ${contactNameOnly(selected)}`,
      detail: res.alreadyStopped ? "The stop-bot tag was already on the contact." : `Tag queued ${formatEt(new Date().toISOString())}`,
      id: null,
    });
  }

  const leadLabel = selected ? contactLabel(selected) : "Lead";
  const underReview: UnderReview | null = selected
    ? {
        kind: selected.message_type,
        text: selected.reply_text,
        skipReason: selected.skip_reason,
        at: selected.sent_at ?? selected.generated_at,
        channel: selected.channel,
        workflowCode: selected.workflow_code,
        subject: null,
      }
    : null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-h-0 lg:h-[calc(100vh-19rem)]">
        <QueueList
          rows={rows}
          selectedId={selected?.context_id ?? null}
          total={total}
          page={page}
          reviewedIds={reviewedIds}
          onSelect={selectRow}
          onLoadMore={() => go({ page: String(page + 1) })}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {errorMsg && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {errorMsg}
          </p>
        )}

        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
            <p className="font-display text-lg font-semibold text-navy-900 dark:text-white">
              {rows.length === 0 ? "You're caught up." : "Pick a message to review."}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              {rows.length === 0
                ? "New messages show up here as the bot sends them."
                : "Use J and K to move through the queue."}
            </p>
          </div>
        ) : (
          <>
            <ContextStrip row={selected} canStopBot={canStopBot} onStopBot={() => setStopOpen(true)} />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <ConversationThread turns={thread} underReview={underReview!} leadLabel={leadLabel} />
            </div>
            <FeedbackPanel
              key={selected.context_id}
              messageType={selected.message_type as MessageType}
              originalText={selected.reply_text}
              reasons={reasons}
              readOnly={myFeedback != null}
              existingVerdict={
                myFeedback
                  ? {
                      verdict: myFeedback.verdict,
                      reasonCodes: myFeedback.reason_codes,
                      note: myFeedback.note,
                      gold: myFeedback.gold,
                      at: formatEt(myFeedback.created_at),
                    }
                  : null
              }
              onSubmit={onSubmit}
              onSkip={() => advance(selected.context_id)}
              submitting={submitting}
            />
          </>
        )}
      </div>

      {toast && (
        <UndoToast
          key={`${toast.id ?? "none"}-${toast.message}`}
          message={toast.message}
          detail={toast.detail}
          onUndo={onUndo}
          onDone={() => setToast(null)}
        />
      )}

      {stopOpen && selected && (
        <StopBotModal
          leadLabel={leadLabel}
          entryTag={selected.intent_class}
          busy={stopBusy}
          onCancel={() => setStopOpen(false)}
          onConfirm={onConfirmStop}
        />
      )}
    </div>
  );
}
