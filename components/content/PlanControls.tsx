"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { planPeriod, generateBatch } from "@/lib/actions/content";

/**
 * Executive-gated plan + batch controls (Part 2 §2.6). "Plan next N days" fires the
 * cheap planner; "Generate up to N" fills planned slots with finished drafts (N capped
 * at MAX_PER_GENERATION server-side and here). Both refresh the calendar on success.
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

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
      else {
        setMsg({ tone: "info", text: res.error ?? okText });
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
            `Planning the next ${planHorizonDays} days — the slots will appear shortly.`,
          )
        }
      >
        {busy("plan") ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CalendarPlus className="h-3.5 w-3.5" />
        )}{" "}
        Plan next {planHorizonDays} days
      </Button>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-slate-600 dark:text-slate-300">Generate up to</label>
        <input
          type="number"
          min={1}
          max={maxPerGeneration}
          value={n}
          onChange={(e) => {
            const v = Math.max(1, Math.min(maxPerGeneration, Number(e.target.value) || 1));
            setN(v);
          }}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run("batch", () => generateBatch(n), `Generating up to ${n} drafts — they'll appear as they finish.`)
          }
        >
          {busy("batch") ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}{" "}
          Generate
        </Button>
      </div>

      {msg && (
        <span className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
