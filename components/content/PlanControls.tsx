"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Sparkles, Compass, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { planPeriod, generateBatch, runStrategist } from "@/lib/actions/content";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executive-gated plan + brief + batch controls (Part 2 §2.6).
 *
 * LAYOUT (2026-08-24). These were three buttons and two loose inputs sitting inline
 * next to the month nav, the Generate-post date picker, the media select, the
 * needs-approval filter and the legend — nine controls competing for attention above
 * the grid. They now live behind a single "Planning" button and open as a stacked
 * panel, one numbered row per step, so the sequence reads top to bottom instead of
 * left to right.
 *
 * OWNERSHIP. The three steps are a sequence, not alternatives:
 *
 *   1. Plan calendar   → WF-Plan. OWNS the plan: pillar, archetype, subtopic and
 *                        campaign for each date. Nothing else writes those columns.
 *                        Fills the nearest missing days first, and reclaims a future
 *                        day whose slot was left 'skipped' with no post.
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
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [n, setN] = useState(maxPerGeneration);
  const [briefDate, setBriefDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const busy = (key: string) => pending && activeKey === key;

  // Close on outside click / Escape — but never while work is in flight, so the panel
  // can't vanish mid-run and hide the progress line.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (pending) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, pending]);

  // pollSeconds > 0 keeps the spinner lit and refreshes the calendar on an interval
  // after the action returns — used for the batch run and the brief, whose work
  // continues server-side.
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

  const inputCls =
    "rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="relative" ref={wrapRef}>
      <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Compass className="h-3.5 w-3.5" />
        )}{" "}
        Planning
        <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Run in order. Plan sets the topic for each date, the brief adds the angle for
            one day, generate writes the drafts.
          </p>

          <Step
            n={1}
            title="Plan calendar"
            hint={`Fills any missing day in the next ${planHorizonDays}, nearest first.`}
          >
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
              {busy("plan") ? "Planning…" : `Plan ${planHorizonDays} days`}
            </Button>
          </Step>

          <Step
            n={2}
            title="Write brief"
            hint="Optional. The date must already be planned; the brief keeps that day's topic."
          >
            <input
              type="date"
              value={briefDate}
              disabled={pending}
              aria-label="Date to write a brief for"
              onChange={(e) => setBriefDate(e.target.value)}
              className={inputCls}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
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
              {busy("strategist") ? "Writing…" : "Write"}
            </Button>
          </Step>

          <Step
            n={3}
            title="Generate drafts"
            hint="Turns planned days into drafts, oldest first."
          >
            <input
              type="number"
              min={1}
              max={maxPerGeneration}
              value={n}
              disabled={pending}
              aria-label="How many drafts to generate"
              onChange={(e) => {
                const v = Math.max(1, Math.min(maxPerGeneration, Number(e.target.value) || 1));
                setN(v);
              }}
              className={`w-16 ${inputCls}`}
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
          </Step>

          {pending && (
            <p className="mt-2.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800">
              {busy("batch")
                ? "Working — drafts appear on the calendar as each one finishes."
                : busy("strategist")
                  ? "Working — the brief appears on the target day shortly."
                  : "Working…"}
            </p>
          )}
          {!pending && msg && (
            <p
              className={`mt-2.5 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800 ${
                msg.tone === "error" ? "text-rose-600" : "text-slate-500"
              }`}
            >
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One numbered row in the planning panel: label + hint on top, controls beneath. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 py-2 first:border-t-0 first:pt-0 dark:border-slate-800">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400">{n}</span>
        <span className="text-xs font-medium text-navy-900 dark:text-white">{title}</span>
      </div>
      <p className="mb-1.5 ml-4 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        {hint}
      </p>
      <div className="ml-4 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
