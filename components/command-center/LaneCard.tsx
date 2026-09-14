"use client";

/**
 * One card in the Stale-issues or To-dos lane.
 *
 * It is NOT a fork of RulingCard. Everything the two share — the frame, the
 * badge row, the recommendation block, the "AI suggests" marker, the read-only
 * line, the settled state — comes from CardChrome.tsx, which was moved out of
 * RulingCard rather than copied. What is left here is the part that genuinely
 * differs: three or four buttons instead of a decision workflow, and no
 * decision text, no options, no supersedes guard, because a stale issue has
 * none of those things to argue about.
 *
 * The lanes ask one question each:
 *   stale  is this still broken?   Still broken · Fixed (needs proof) · No longer matters
 *   todos  is this still yours?    Done · Drop · Keep · Assign
 *
 * And the safe answer is free in both. "Still broken" and "Keep" change nothing
 * but the clock, take no evidence and no typing. "Fixed" costs a link, because
 * closing an issue on a guess is worse than leaving it open.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Working } from "@/components/ui/Working";
import { rule, recheck } from "@/lib/actions/commandCenter";
import {
  buttonsFor, suggestedButton, needsReason, stripOmiPrefix, errorMessageFor,
  type QueueCard, type CardButton, type RuleErrorCode,
} from "@/lib/commandCenter/rules";
import { CardBadges, Recommendation, ButtonRow, ReadOnlyNote, SettledCard } from "./CardChrome";
import { ReasonDialog } from "./ReasonDialog";
import { ProofDialog, AssignDialog } from "./ProofDialog";

type Stage =
  | { kind: "idle" }
  | { kind: "proof" }
  | { kind: "assign" }
  | { kind: "reason"; button: CardButton; extra: Record<string, string> };

/** Past tense, so a settled card says what was done rather than what was clicked. */
const SETTLED: Record<string, string> = {
  still_broken: "Marked still broken — the clock is reset, nothing was closed.",
  fixed: "Closed as fixed.",
  no_longer_matters: "Closed — no longer relevant.",
  done: "Marked done.",
  drop: "Dropped.",
  keep: "Kept — back in 30 days.",
  assign: "Assigned.",
};

export function LaneCard({ card, canRule }: { card: QueueCard; canRule: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);

  const busy = (key: string) => pending && activeKey === key;
  const buttons = buttonsFor(card);
  const suggested = suggestedButton(card);

  function send(button: CardButton, extra: Record<string, string> = {}) {
    setError(null);
    setActiveKey(button.id);
    startTransition(async () => {
      const res = await rule({
        action: button.action,
        target: { table: card.source_table, id: card.source_id },
        card_version: card.card_version ?? undefined,
        ...extra,
      });
      setActiveKey(null);
      if (res.ok) {
        setStage({ kind: "idle" });
        // Collapse to a line rather than re-rendering the page: on a lane with
        // 2,400 cards a full refresh per ruling is what makes a pass feel slow.
        setSettled(SETTLED[button.action] ?? "Ruled.");
        return;
      }
      const { text, reload } = errorMessageFor(res.code as RuleErrorCode, res.message);
      setError(text);
      setStage({ kind: "idle" });
      if (reload) setTimeout(() => router.refresh(), 1200);
    });
  }

  /** Collect what this button needs, then send. */
  function click(button: CardButton, extra: Record<string, string> = {}) {
    if (button.opens === "proof" && !extra.proof) return setStage({ kind: "proof" });
    if (button.opens === "assign" && !extra.assignee) return setStage({ kind: "assign" });
    // Disagreeing with the recommendation costs one sentence; agreeing is free.
    if (needsReason(button.action, card.rec_verdict) && !extra.reason) {
      return setStage({ kind: "reason", button, extra });
    }
    send(button, extra);
  }

  const buttonFor = (id: string) => buttons.find((b) => b.id === id)!;

  if (settled) return <SettledCard label={settled} />;

  const body = stripOmiPrefix(card.description);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <CardBadges card={card} />

        <p className="whitespace-pre-wrap text-sm text-navy-900 dark:text-slate-100">{body}</p>

        <Recommendation card={card} />

        {canRule ? (
          <ButtonRow
            buttons={buttons}
            suggested={suggested}
            pending={pending}
            busy={busy}
            onClick={(b) => click(b)}
            trailing={
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setActiveKey("recheck");
                  startTransition(async () => {
                    const res = await recheck(card.source_table, card.source_id);
                    setActiveKey(null);
                    if (!res.ok) setError(errorMessageFor(res.code as RuleErrorCode, res.message).text);
                    else router.refresh();
                  });
                }}
                className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 underline hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <RefreshCw className={busy("recheck") ? "h-3 w-3 animate-spin" : "h-3 w-3"} aria-hidden />
                {busy("recheck") ? "Re-checking…" : "Re-check"}
              </button>
            }
          />
        ) : (
          <ReadOnlyNote />
        )}

        {pending && activeKey === null ? <Working label="Saving this ruling" /> : null}

        {error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </CardContent>

      <ProofDialog
        open={stage.kind === "proof"}
        title="What fixed it?"
        subtitle="Closing an issue as fixed needs something someone could follow."
        pending={pending}
        onCancel={() => setStage({ kind: "idle" })}
        onConfirm={(proof) => click(buttonFor("fixed"), { proof })}
      />

      <AssignDialog
        open={stage.kind === "assign"}
        pending={pending}
        onCancel={() => setStage({ kind: "idle" })}
        onConfirm={(assignee) => click(buttonFor("assign"), { assignee })}
      />

      <ReasonDialog
        open={stage.kind === "reason"}
        title="Say why"
        prompt={
          stage.kind === "reason"
            ? `This goes against the suggestion (${String(card.rec_verdict ?? "").replace(/_/g, " ")}).`
            : undefined
        }
        pending={pending}
        onCancel={() => setStage({ kind: "idle" })}
        onConfirm={(reason) => {
          if (stage.kind !== "reason") return;
          send(stage.button, { ...stage.extra, reason });
        }}
      />
    </Card>
  );
}
