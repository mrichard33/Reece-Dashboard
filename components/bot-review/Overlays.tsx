"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ShieldCheck } from "lucide-react";

/**
 * The three small overlays the Review tab needs: the undo toast, the stop-bot
 * confirm, and the calibration banner.
 */

/**
 * Undo toast with a visible countdown.
 *
 * The bar is cosmetic — the real window is a DB trigger on bot_feedback, which
 * refuses an undo more than 15 seconds after the row was created. The UI counts
 * 10 so a reviewer who clicks on the last tick still lands inside it. If they
 * miss it, the endpoint says "Too late to undo — that review is already saved."
 * rather than pretending.
 */
export function UndoToast({
  message,
  detail,
  seconds = 10,
  onUndo,
  onDone,
}: {
  message: string;
  detail?: string;
  seconds?: number;
  onUndo: () => void;
  onDone: () => void;
}) {
  // Seeded once at mount. The caller gives each toast a fresh key, so a new
  // toast is a new component with a fresh countdown — no re-seeding inside the
  // effect, which would cascade a render every time the props object changed.
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          onDone();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onDone]);

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-900 dark:text-white">{message}</p>
          {detail && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 text-sm font-semibold text-navy-700 hover:underline dark:text-navy-200"
        >
          Undo
        </button>
      </div>
      <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-navy-600 transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
      <p className="px-4 pb-2 text-[11px] text-slate-400">{left} seconds to undo</p>
    </div>
  );
}

/** Danger confirm for stop-bot. The wording is the design's, verbatim. */
export function StopBotModal({
  leadLabel,
  entryTag,
  busy,
  onCancel,
  onConfirm,
}: {
  leadLabel: string;
  entryTag?: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Stop the bot for this lead?"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="font-display text-lg font-semibold text-navy-900 dark:text-white">
          Stop the bot for this lead?
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {leadLabel}
          {entryTag ? ` · ${entryTag}` : ""}
        </p>
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
          This applies the <span className="font-mono text-xs">stop-bot</span> tag. The bot won&apos;t reply to this
          lead again until someone removes it.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "Stopping…" : "Stop the bot"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Calibration banner. Informational only — nothing is disabled, because a team
 * member calibrates BY reviewing. Their verdicts are stored with counts=false
 * and counted retroactively once they pass.
 */
export function CalibrationBanner({
  done,
  target,
  agreement,
  agreementTarget,
}: {
  done: number;
  target: number;
  agreement: number | null;
  agreementTarget: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">
          Your reviews count once you&apos;ve matched Mark on {target} calibration messages.
        </p>
        <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
          {done} of {target} done. Keep reviewing — nothing you score now is wasted.
          {agreement != null && (
            <> Agreement so far: {Math.round(agreement * 100)}% (need {Math.round(agreementTarget * 100)}%).</>
          )}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800",
          "ring-1 ring-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:ring-amber-800",
        )}
      >
        {done}/{target}
      </span>
    </div>
  );
}

/** Shown wherever a rate would be built on fewer than 30 reviews. */
export function NotEnoughData({ reviewed }: { reviewed?: number | null }) {
  return (
    <span
      className="text-xs italic text-slate-400 dark:text-slate-500"
      title={`Minimum 30 reviewed to show a rate.${reviewed != null ? ` This path has ${reviewed}.` : ""}`}
    >
      Not enough data yet
    </span>
  );
}
