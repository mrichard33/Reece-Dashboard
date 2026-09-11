"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";

/** Today + n days, as YYYY-MM-DD. The server re-checks that it is in the future. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "Not now" without losing the card. It drops out of the queue until the date
 * and comes back on its own — which is the difference between deferring
 * something and quietly dropping it.
 */
export function SnoozeDialog({
  open, pending, onCancel, onConfirm,
}: {
  open: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (until: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      title="Not now"
      subtitle="It leaves the queue and comes back on this date."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => onConfirm(inDays(7))}>
            1 week
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => onConfirm(inDays(30))}>
            1 month
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Or pick a date
          </label>
          <input
            type="date"
            min={inDays(1)}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button disabled={pending || !custom} onClick={() => onConfirm(custom)}>
            {pending ? "Saving…" : "Snooze until then"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
