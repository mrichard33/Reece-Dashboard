"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { incidentAct, runCheckNow, type ActionResult } from "@/lib/actions/incidents";

/** "Run all checks now" / "Run check now": operators only (the action checks too). */
export function RunChecksButton({ checkId = "all", label }: { checkId?: string; label?: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => setRes(await runCheckNow(checkId)))}>
        {pending ? "Running…" : (label ?? (checkId === "all" ? "Run all checks now" : "Run check now"))}
      </Button>
      {res && <ResultLine res={res} />}
    </div>
  );
}

function ResultLine({ res }: { res: ActionResult }) {
  return (
    <p className={res.ok ? "text-xs text-emerald-700 dark:text-emerald-400" : "break-words text-xs text-brick-600 dark:text-brick-400"}>
      {res.ok ? res.message : res.error}
    </p>
  );
}

/**
 * Acknowledge / Snooze / Close (no action) / Run check now on one incident.
 * Snooze and Close ask for a reason (LP-MCP refuses them without one).
 */
export function IncidentActions({ id, status, acknowledged }: { id: number; status: string; acknowledged: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);
  const [mode, setMode] = useState<"snooze" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(2);
  const terminal = status === "resolved" || status === "closed_no_action";
  const act = (action: "ack" | "snooze" | "close" | "run") =>
    start(async () => {
      const out = await incidentAct({ id, action, reason: reason || undefined, minutes: action === "snooze" ? hours * 60 : undefined });
      setRes(out);
      if (out.ok) { setMode(null); setReason(""); }
    });

  if (terminal) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => act("run")}>Run check now</Button>
        {res && <ResultLine res={res} />}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "open" && !acknowledged && (
          <Button size="sm" disabled={pending} onClick={() => act("ack")}>Acknowledge</Button>
        )}
        {status !== "snoozed" && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setMode(mode === "snooze" ? null : "snooze")}>Snooze</Button>
        )}
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => setMode(mode === "close" ? null : "close")}>Close (no action)</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => act("run")}>Run check now</Button>
      </div>
      {mode && (
        <form
          className="flex w-full flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); act(mode); }}
        >
          <label className="flex w-full flex-col gap-1 text-xs text-slate-600 dark:text-slate-300 sm:flex-1">
            {mode === "snooze" ? "Why snooze it?" : "Why is no action needed? (it stays quiet for 7 days)"}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base sm:text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          {mode === "snooze" && (
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
              For
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base sm:text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {[1, 2, 4, 8, 24].map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </label>
          )}
          <Button type="submit" size="sm" disabled={pending || !reason.trim()}>
            {pending ? "Saving…" : mode === "snooze" ? "Snooze" : "Close"}
          </Button>
        </form>
      )}
      {res && <ResultLine res={res} />}
    </div>
  );
}
