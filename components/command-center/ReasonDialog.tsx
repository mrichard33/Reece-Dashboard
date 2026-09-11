"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { REASON_QUICK_PICKS } from "@/lib/commandCenter/rules";

/**
 * Asked for only when a reason is actually required — a reject, a flip, or a
 * ruling that goes against the recommendation. Everywhere else the ruling goes
 * straight through: making someone justify agreeing with the recommendation is
 * how a 385-item queue stays at 385.
 *
 * The quick-picks are the five reasons that come up over and over. They fill the
 * box rather than replacing it, so a pick can still be added to.
 */
export function ReasonDialog({
  open, title, prompt, pending, onCancel, onConfirm,
}: {
  open: boolean;
  title: string;
  /** Why a reason is being asked for — shown above the box. */
  prompt?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  function close() { setReason(""); onCancel(); }

  return (
    <Drawer open={open} onClose={close} title={title} subtitle={prompt}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {REASON_QUICK_PICKS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setReason((r) => (r.trim() ? `${r.trim()} — ${q}` : q))}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {q}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Reason
          </label>
          <textarea
            autoFocus
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="In your words — this is what you'll read in six months."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
          <Button
            onClick={() => onConfirm(reason.trim())}
            disabled={pending || !reason.trim()}
          >
            {pending ? "Saving…" : "Save ruling"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
