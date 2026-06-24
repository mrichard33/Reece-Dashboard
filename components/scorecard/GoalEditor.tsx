"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { saveScorecardGoals } from "@/lib/actions/scorecard";
import { GoalSchema } from "@/lib/scorecard/goalSchema";
import type { ScorecardGoals } from "@/lib/queries/scorecard";
import { usd } from "@/lib/utils";

type FieldSpec = { name: string; label: string; step?: string };

// monthly_goal_dollars / growth_pct are handled in the Goal-mode section; these are
// the always-numeric remaining inputs.
const FIELDS: FieldSpec[] = [
  { name: "working_days", label: "Working Days", step: "1" },
  { name: "trailing_nsli", label: "Trailing NSLI ($)", step: "1" },
  { name: "target_close_pct", label: "Target Close %", step: "0.1" },
  { name: "target_demo_pct", label: "Target Demo %", step: "0.1" },
  { name: "target_good_rate_pct", label: "Target Good Rate %", step: "0.1" },
  { name: "target_ko_pct", label: "Target KO %", step: "0.1" },
];

const n1 = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));

/**
 * Admin-only goal editor. Supports two modes: a flat dollar goal, or a growth %
 * applied to a trailing baseline (resolved server-side and passed in as
 * `baselineNetSales`). Previews the resulting goal $ and the required per-day
 * issued/demoed/closed before saving. Validates with the shared zod GoalSchema.
 */
export function GoalEditor({
  goals,
  baselineNetSales,
}: {
  goals: ScorecardGoals;
  baselineNetSales: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { register, handleSubmit, watch } = useForm<Record<string, string>>({
    defaultValues: {
      goal_mode: goals.goal_mode,
      monthly_goal_dollars: String(goals.monthly_goal_dollars),
      growth_pct: goals.growth_pct != null ? String(goals.growth_pct) : "",
      working_days: String(goals.working_days),
      trailing_nsli: String(goals.trailing_nsli),
      target_close_pct: String(goals.target_close_pct),
      target_demo_pct: String(goals.target_demo_pct),
      target_good_rate_pct: String(goals.target_good_rate_pct),
      target_ko_pct: String(goals.target_ko_pct),
      target_issue_pct: goals.target_issue_pct != null ? String(goals.target_issue_pct) : "",
      target_net_close_pct:
        goals.target_net_close_pct != null ? String(goals.target_net_close_pct) : "",
    },
  });

  // Live preview of the resulting goal $ and required per-day pace.
  const w = watch();
  const mode = w.goal_mode === "growth_pct" ? "growth_pct" : "dollars";
  const growth = Number(w.growth_pct);
  const effectiveGoal =
    mode === "growth_pct"
      ? baselineNetSales != null && Number.isFinite(growth)
        ? Math.round(baselineNetSales * (1 + growth / 100))
        : null
      : Number(w.monthly_goal_dollars) || 0;
  const wd = Number(w.working_days) || 1;
  const tnsli = Number(w.trailing_nsli) || 0;
  const demoPct = Number(w.target_demo_pct) || 0;
  const closePct = Number(w.target_close_pct) || 0;
  const issuedPerDay =
    effectiveGoal != null && tnsli > 0 ? effectiveGoal / tnsli / wd : null;
  const demoedPerDay = issuedPerDay != null ? issuedPerDay * (demoPct / 100) : null;
  const closedPerDay = demoedPerDay != null ? demoedPerDay * (closePct / 100) : null;

  const onSubmit = handleSubmit((raw) => {
    setMsg(null);
    const m = raw.goal_mode === "growth_pct" ? "growth_pct" : "dollars";
    const candidate = {
      market: goals.market,
      goal_mode: m,
      monthly_goal_dollars: Number(raw.monthly_goal_dollars) || 0,
      growth_pct: raw.growth_pct === "" ? null : Number(raw.growth_pct),
      working_days: Number(raw.working_days),
      trailing_nsli: Number(raw.trailing_nsli),
      target_close_pct: Number(raw.target_close_pct),
      target_demo_pct: Number(raw.target_demo_pct),
      target_good_rate_pct: Number(raw.target_good_rate_pct),
      target_ko_pct: Number(raw.target_ko_pct),
      target_issue_pct: raw.target_issue_pct === "" ? null : Number(raw.target_issue_pct),
      target_net_close_pct:
        raw.target_net_close_pct === "" ? null : Number(raw.target_net_close_pct),
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

  const inputCls =
    "rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono tabular text-sm text-navy-900 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  return (
    <Card>
      <CardHeader>
        <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
          Edit Goals
        </h3>
        {goals.updated_by && (
          <span className="text-xs text-slate-500">Last edited by {goals.updated_by}</span>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Goal mode */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Goal Mode
              </span>
              <select className={inputCls} {...register("goal_mode")}>
                <option value="dollars">Dollars</option>
                <option value="growth_pct">Growth %</option>
              </select>
            </label>

            {mode === "dollars" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Monthly Goal ($)
                </span>
                <input type="number" step="1000" min="0" inputMode="decimal" className={inputCls} {...register("monthly_goal_dollars")} />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Growth %
                </span>
                <input type="number" step="0.1" inputMode="decimal" className={inputCls} {...register("growth_pct")} />
              </label>
            )}
          </div>

          {/* Remaining numeric targets */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {f.label}
                </span>
                <input type="number" step={f.step} min="0" inputMode="decimal" className={inputCls} {...register(f.name)} />
              </label>
            ))}
          </div>

          {/* Optional funnel-stage targets (blank = no target) */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Target Issue % <span className="normal-case text-slate-400">(optional)</span>
              </span>
              <input type="number" step="0.1" min="0" max="100" inputMode="decimal" placeholder="no target" className={inputCls} {...register("target_issue_pct")} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Target Net Close % <span className="normal-case text-slate-400">(optional)</span>
              </span>
              <input type="number" step="0.1" min="0" max="100" inputMode="decimal" placeholder="no target" className={inputCls} {...register("target_net_close_pct")} />
            </label>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Preview</div>
            {mode === "growth_pct" && (
              <p className="text-slate-600 dark:text-slate-300">
                Baseline net sales{" "}
                <span className="font-mono">{baselineNetSales != null ? usd(baselineNetSales) : "—"}</span>
                {" × "}
                <span className="font-mono">{Number.isFinite(growth) ? `${growth >= 0 ? "+" : ""}${growth}%` : "—"}</span>
                {" → goal "}
                <span className="font-mono font-semibold">{effectiveGoal != null ? usd(effectiveGoal) : "—"}</span>
              </p>
            )}
            {mode === "dollars" && (
              <p className="text-slate-600 dark:text-slate-300">
                Monthly goal <span className="font-mono font-semibold">{usd(effectiveGoal ?? 0)}</span>
              </p>
            )}
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Required / day — issued <span className="font-mono">{n1(issuedPerDay)}</span>, demoed{" "}
              <span className="font-mono">{n1(demoedPerDay)}</span>, closed{" "}
              <span className="font-mono">{n1(closedPerDay)}</span>
              {tnsli <= 0 && <span className="ml-2 text-amber-600">set Trailing NSLI to compute pace</span>}
            </p>
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
              <span className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
