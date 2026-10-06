/**
 * Bot Review — the one-click 👍 on a bot bubble (2026-10-06).
 *
 * It is the existing submitFeedback with verdict 'good' and nothing else, so
 * the calibration rules and LP MCP's checks are exactly the ones the full form
 * uses. Kept out of the component so it is testable without a DOM: one click
 * is one review, however fast the reviewer double-clicks.
 */

import { emptyDraft, type FeedbackDraft, type MessageType } from "./core";

export type QuickTarget = {
  contextId: number;
  messageType: MessageType;
  messageRef: string;
  originalText: string | null;
};

type SubmitResult = { ok: true; data: { id: number; uncalibrated?: boolean } } | { ok: false; error: string };

export type QuickDeps = {
  submit: (input: { messageType: MessageType; messageRef: string; originalText: string | null; draft: FeedbackDraft }) => Promise<SubmitResult>;
  /** Shows the undo toast for the saved review. */
  onSaved: (contextId: number, feedbackId: number, uncalibrated: boolean) => void;
  onError: (message: string) => void;
};

export function createThumbsUp(deps: QuickDeps) {
  const inFlight = new Set<number>();
  return async function thumbsUp(t: QuickTarget): Promise<void> {
    if (inFlight.has(t.contextId)) return;
    inFlight.add(t.contextId);
    try {
      const res = await deps.submit({
        messageType: t.messageType,
        messageRef: t.messageRef,
        originalText: t.originalText,
        draft: { ...emptyDraft, verdict: "good", betterText: t.originalText ?? "" },
      });
      if (res.ok) deps.onSaved(t.contextId, res.data.id, res.data.uncalibrated === true);
      else deps.onError(res.error);
    } finally {
      inFlight.delete(t.contextId);
    }
  };
}
