"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Sparkles, Compass, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { planPeriod, generateBatch, runStrategist } from "@/lib/actions/content";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executive-gated plan + brief + batch controls (Part 2 §2.6).
 *
 * OWNERSHIP (2026-08-24). These three buttons are a sequence, not alternatives:
 *
 *   1. Plan calendar   → WF-Plan. OWNS the plan: pillar, archetype, subtopic and
 *                        campaign for each date. Nothing else writes those columns.
 *   2. Write brief     → WF-Strategist. Owns the ANGLE for one already-planned day
 *                        (hook, proof, media format, CTA). It attaches a brief to a
 *                        slot and can no longer change the slot itself.
 *   3. Generate drafts → WF-Batch. Turns planned slots (plus an approved brief, when
 *                        there is one) into actual drafts on the calendar.
 *
 * Step 2 is optional enrichment — a slot with no brief still generates from its
 * pillar and subtopic. Approve the brief on the day's slot between 2 and 3.
 *
 * Spinner behaviour: "Plan calendar" responds when WF-Plan finishes, so the spinner
 * naturally covers the wait. "Generate drafts" and "Write brief" return almost
 * immediately and keep working server-side, so for those we keep the spinner lit and
 * poll the calendar (router.refresh) on an interval — rather than the spinner
 * vanishing in ~1s while work continues invisibly.
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
  const [briefDate, setBriefDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const busy = (key: string) => pending && activeKey === key;

  // pollSeconds > 0 keeps the spinner lit and refreshes the calendar on an interval after
  // the action returns — used for the batch run and the brief, whose work continues
  // server-side.
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
    <div className="space-y-1.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Run in order:{" "}
        <span className="font-medium text-slate-600 dark:text-slate-300">plan</span> sets the
        pillar for each date ·{" "}
        <span className="font-medium text-slate-600 dark:text-slate-300">brief</span> adds the
        angle for one day (optional) ·{" "}
        <span className="font-medium text-slate-600 dark:text-slate-300">generate</span> writes
        the drafts.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          title={`Fills any unplanned day in the next ${planHorizonDays} days. Never changes a day that is already planned.`}
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
          {busy("plan") ? "Planning…" : `1 · Plan calendar (${planHorizonDays}d)`}
        </Button>

        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 px-1.5 py-1 dark:border-slate-700">
          <label className="text-xs text-slate-600 dark:text-slate-300">for</label>
          <input
            type="date"
            value={briefDate}
            disabled={pending}
            onChange={(e) => setBriefDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            title="Writes the angle for one planned day. The date must already be planned — it keeps that day's pillar, archetype and subtopic."
            onClick={() =>
              run(
                "strategist",
                () => runStrategist(briefDate),
                `Writing the brief for ${briefDate} — open that day to review + approve it.`,
                25,
              )
            }
          >
            {busy("strategist") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Compass className="h-3.5 w-3.5" />
            )}{" "}
            {busy("strategist") ? "Writing…" : "2 · Write brief"}
          </Button>
        </div>

        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 px-1.5 py-1 dark:border-slate-700">
          <label className="text-xs text-slate-600 dark:text-slate-300">up to</label>
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
            title="Turns planned slots into drafts, oldest first. Uses the approved brief for a day when there is one."
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
            {busy("batch") ? "Generating…" : "3 · Generate drafts"}
          </Button>
        </div>

        {(busy("batch") || busy("plan") || busy("strategist")) && (
          <span className="text-xs text-slate-500">
            {busy("batch")
              ? "Working — drafts appear on the calendar as each one finishes."
              : busy("strategist")
                ? "Working — the brief appears on the target day shortly."
                : "Working…"}
          </span>
        )}
        {!pending && msg && (
          <span className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
