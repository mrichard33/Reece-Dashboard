"use client";

/**
 * Take a whole pass back.
 *
 * The batch pass is only defensible because this exists. Fifty rulings that
 * cannot be reversed is a bet; fifty that come back exactly is a decision you
 * are allowed to change your mind about.
 *
 * "Exactly" is the important word. claude_rule_batch_undo validates the WHOLE
 * batch before it touches a row, so a half-undone batch cannot exist — if
 * somebody has ruled on one of those cards since, the undo is refused and says
 * which card, rather than restoring forty-nine and quietly overwriting the one
 * ruling that was made on purpose.
 *
 * A reason is required, because an undo is a ruling too and the history should
 * say why rather than just that it happened.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Loader2 } from "lucide-react";
import { ruleBatchUndo } from "@/lib/actions/commandCenter";
import { errorMessageFor, type RuleErrorCode } from "@/lib/commandCenter/rules";
import { ReasonDialog } from "./ReasonDialog";

export function BatchUndoButton({
  batchId, count, canRule,
}: {
  batchId: string;
  /** How many cards this pass ruled, so the button says what it is undoing. */
  count: number;
  canRule: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!canRule) return null;
  if (done) {
    return <span className="text-xs text-slate-500 dark:text-slate-400">Reversed.</span>;
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-slate-500 underline hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {pending
          ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          : <Undo2 className="h-3 w-3" aria-hidden />}
        Undo {count > 1 ? `all ${count}` : "this"}
      </button>

      {error ? (
        <span className="ml-2 text-xs text-rose-700 dark:text-rose-300">{error}</span>
      ) : null}

      <ReasonDialog
        open={open}
        title={count > 1 ? `Reverse all ${count}?` : "Reverse this ruling?"}
        prompt="Every row goes back exactly as it was. If anything has been ruled on since, the whole undo is refused rather than half-applied."
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={(reason) => {
          setError(null);
          setOpen(false);
          startTransition(async () => {
            const res = await ruleBatchUndo(batchId, reason);
            if (res.ok) { setDone(true); router.refresh(); return; }
            const { text, reload } = errorMessageFor(res.code as RuleErrorCode, res.message);
            setError(text);
            if (reload) setTimeout(() => router.refresh(), 1200);
          });
        }}
      />
    </>
  );
}
