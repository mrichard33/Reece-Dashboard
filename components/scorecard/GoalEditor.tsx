"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { saveScorecardGoals } from "@/lib/actions/scorecard";
import { GoalSchema, type GoalValues } from "@/lib/scorecard/goalSchema";
import type { ScorecardGoals } from "@/lib/queries/scorecard";

type FieldSpec = { name: keyof GoalValues; label: string; step?: string };

const FIELDS: FieldSpec[] = [
  { name: "monthly_goal_dollars", label: "Monthly Goal ($)", step: "1000" },
  { name: "working_days", label: "Working Days", step: "1" },
  { name: "trailing_nsli", label: "Trailing NSLI ($)", step: "1" },
  { name: "target_close_pct", label: "Target Close %", step: "0.1" },
  { name: "target_demo_pct", label: "Target Demo %", step: "0.1" },
  { name: "target_good_rate_pct", label: "Target Good Rate %", step: "0.1" },
  { name: "target_ko_pct", label: "Target KO %", step: "0.1" },
];

/**
 * Admin-only goal targets editor. Validates with the shared zod GoalSchema and
 * calls the (also admin-gated) saveScorecardGoals server action. On success the
 * action revalidates /scorecard, so the goal columns / pace / variance refresh
 * immediately — no cron wait.
 */
export function GoalEditor({ goals }: { goals: ScorecardGoals }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { register, handleSubmit } = useForm<Record<string, string>>({
    defaultValues: {
      monthly_goal_dollars: String(goals.monthly_goal_dollars),
      working_days: String(goals.working_days),
      trailing_nsli: String(goals.trailing_nsli),
      target_close_pct: String(goals.target_close_pct),
      target_demo_pct: String(goals.target_demo_pct),
      target_good_rate_pct: String(goals.target_good_rate_pct),
      target_ko_pct: String(goals.target_ko_pct),
    },
  });

  const onSubmit = handleSubmit((raw) => {
    setMsg(null);
    const candidate = {
      market: goals.market,
      monthly_goal_dollars: Number(raw.monthly_goal_dollars),
      working_days: Number(raw.working_days),
      trailing_nsli: Number(raw.trailing_nsli),
      target_close_pct: Number(raw.target_close_pct),
      target_demo_pct: Number(raw.target_demo_pct),
      target_good_rate_pct: Number(raw.target_good_rate_pct),
      target_ko_pct: Number(raw.target_ko_pct),
    };
    const parsed = GoalSchema.safeParse(candidate);
    if (!parsed.success) {
      setMsg({ ok: false, text: parsed.error.issues[0]?.message ?? "Invalid values." });
      return;
    }
    startTransition(async () => {
      const res = await saveScorecardGoals(parsed.data);
      setMsg(
        res.ok
          ? { ok: true, text: "Goals saved — figures updated." }
          : { ok: false, text: res.error ?? "Save failed." },
      );
    });
  });

  return (
    <Card>
      <CardHeader>
        <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
          Edit Goals
        </h3>
        {goals.updated_by && (
          <span className="text-xs text-slate-500">
            Last edited by {goals.updated_by}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {f.label}
                </span>
                <input
                  type="number"
                  step={f.step}
                  min="0"
                  inputMode="decimal"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono tabular text-sm text-navy-900 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  {...register(f.name)}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-navy-900 dark:hover:bg-slate-200"
            >
              {pending ? "Saving…" : "Save goals"}
            </button>
            {msg && (
              <span
                className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
