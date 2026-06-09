"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { planPeriod, generateBatch } from "@/lib/actions/content";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executive-gated plan + batch controls (Part 2 §2.6).
 *
 * "Plan next N days" fires the cheap planner (WF-Plan responds when it finishes, so the
 * spinner naturally covers the wait). "Generate up to N" fires WF-Batch, which responds
 * immediately with { ok, started } and then keeps generating drafts in the background for
 * a minute or more. So for the batch case we keep the spinner lit and poll the calendar
 * (router.refresh) on an interval, letting finished drafts stream in while the user still
 * sees that something is happening — rather than the spinner vanishing in ~1s while work
 * continues invisibly.
 */
export function PlanControls({
  planHorizonDays,
  maxPerGeneration,
}: {
  planHorizonDays: number;
  maxPerGeneration: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [n, setN] = useState(maxPerGeneration);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const busy = (key: string) => pending && activeKey === key;

  // pollSeconds > 0 keeps the spinner lit and refreshes the calendar on an interval after
  // the action returns — used for the batch run, whose work continues server-side.
  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okText: string,
    pollSeconds = 0,
  ) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
        return;
      }
      setMsg({ tone: "info", text: res.error ?? okText });
      router.refresh();
      const ticks = Math.ceil(pollSeconds / 4);
      for (let i = 0; i < ticks; i++) {
        await sleep(4000);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run(
            "plan",
            () => planPeriod(format(new Date(), "yyyy-MM-dd"), planHorizonDays),
            `Planned the next ${planHorizonDays} days — the slots are on the calendar.`,
          )
        }
      >
        {busy("plan") ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CalendarPlus className="h-3.5 w-3.5" />
        )}{" "}
        {busy("plan") ? "Planning…" : `Plan next ${planHorizonDays} days`}
      </Button>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-slate-600 dark:text-slate-300">Generate up to</label>
        <input
          type="number"
          min={1}
          max={maxPerGeneration}
          value={n}
          disabled={pending}
          onChange={(e) => {
            const v = Math.max(1, Math.min(maxPerGeneration, Number(e.target.value) || 1));
            setN(v);
          }}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(
              "batch",
              () => generateBatch(n),
              `Generating up to ${n} drafts — they'll appear as they finish.`,
              60,
            )
          }
        >
          {busy("batch") ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}{" "}
          {busy("batch") ? "Generating…" : "Generate"}
        </Button>
      </div>

      {(busy("batch") || busy("plan")) && (
        <span className="text-xs text-slate-500">
          {busy("batch")
            ? "Working — drafts appear on the calendar as each one finishes."
            : "Working…"}
        </span>
      )}
      {!pending && msg && (
        <span className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
