"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Check, Circle } from "lucide-react";
import { saveScorecardGoals } from "@/lib/actions/scorecard";
import { GoalSchema } from "@/lib/scorecard/goalSchema";
import type { ScorecardGoals } from "@/lib/queries/scorecard";
import { usd } from "@/lib/utils";
import { ScCard } from "./ScCard";

type FieldSpec = { name: string; label: string; step?: string; prefix?: string };

// monthly_goal_dollars / growth_pct are handled in the Goal-mode section; these are
// the always-numeric remaining inputs.
const FIELDS: FieldSpec[] = [
  { name: "working_days", label: "Working Days", step: "1" },
  { name: "trailing_nsli", label: "Trailing NSLI ($)", step: "1", prefix: "$" },
  { name: "target_close_pct", label: "Target Close %", step: "0.1" },
  { name: "target_demo_pct", label: "Target Demo %", step: "0.1" },
  { name: "target_good_rate_pct", label: "Target Good Rate %", step: "0.1" },
  { name: "target_ko_pct", label: "Target KO %", step: "0.1" },
];

const n1 = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));

/**
 * Admin-only goal editor (restyled to the redesign's card). Supports a flat dollar
 * goal or a growth % over a trailing baseline (resolved server-side). Previews the
 * resulting goal $ and required per-day pace, flags unsaved changes, and persists
 * to Supabase via the shared server action (validated with the zod GoalSchema).
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

  const initial: Record<string, string> = {
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
    target_net_close_pct: goals.target_net_close_pct != null ? String(goals.target_net_close_pct) : "",
  };

  const { register, handleSubmit, watch } = useForm<Record<string, string>>({ defaultValues: initial });

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
  const issuedPerDay = effectiveGoal != null && tnsli > 0 ? effectiveGoal / tnsli / wd : null;
  const demoedPerDay = issuedPerDay != null ? issuedPerDay * (demoPct / 100) : null;
  const closedPerDay = demoedPerDay != null ? demoedPerDay * (closePct / 100) : null;

  const dirty = Object.keys(initial).some((k) => (w[k] ?? "") !== initial[k]);

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
      target_net_close_pct: raw.target_net_close_pct === "" ? null : Number(raw.target_net_close_pct),
    };
    const parsed = GoalSchema.safeParse(candidate);
    if (!parsed.success) {
      setMsg({ ok: false, text: parsed.error.issues[0]?.message ?? "Invalid values." });
      return;
    }
    startTransition(async () => {
      const res = await saveScorecardGoals(parsed.data);
      setMsg(res.ok ? { ok: true, text: "Goals saved — figures updated." } : { ok: false, text: res.error ?? "Save failed." });
    });
  });

  const fieldWrap = "block";
  const labelCls = "mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500";
  const inputCls =
    "h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-[13.5px] tabular text-slate-800 outline-none transition focus:ring-2 focus:ring-[#274560] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <ScCard
      id="sc-goals"
      title="Edit goals"
      action={goals.updated_by ? <span className="text-[11.5px] text-slate-400">Last edited by {goals.updated_by}</span> : undefined}
    >
      <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
        {/* Goal mode + primary goal */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={fieldWrap}>
            <span className={labelCls}>Goal Mode</span>
            <select className={inputCls} {...register("goal_mode")}>
              <option value="dollars">Dollars</option>
              <option value="growth_pct">Growth %</option>
            </select>
          </label>
          {mode === "dollars" ? (
            <label className={fieldWrap}>
              <span className={labelCls}>Monthly Goal ($)</span>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-slate-400">$</span>
                <input type="number" step="1000" min="0" inputMode="decimal" className={`${inputCls} pl-6`} {...register("monthly_goal_dollars")} />
              </div>
            </label>
          ) : (
            <label className={fieldWrap}>
              <span className={labelCls}>Growth %</span>
              <input type="number" step="0.1" inputMode="decimal" className={inputCls} {...register("growth_pct")} />
            </label>
          )}

          {FIELDS.map((f) => (
            <label key={f.name} className={fieldWrap}>
              <span className={labelCls}>{f.label}</span>
              <div className="relative">
                {f.prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-slate-400">{f.prefix}</span>}
                <input type="number" step={f.step} min="0" inputMode="decimal" className={`${inputCls} ${f.prefix ? "pl-6" : ""}`} {...register(f.name)} />
              </div>
            </label>
          ))}

          {/* Optional funnel-stage targets (blank = no target) */}
          <label className={fieldWrap}>
            <span className={labelCls}>Target Issue % <span className="normal-case text-slate-400">(optional)</span></span>
            <input type="number" step="0.1" min="0" max="100" inputMode="decimal" placeholder="no target" className={inputCls} {...register("target_issue_pct")} />
          </label>
          <label className={fieldWrap}>
            <span className={labelCls}>Target Net Close % <span className="normal-case text-slate-400">(optional)</span></span>
            <input type="number" step="0.1" min="0" max="100" inputMode="decimal" placeholder="no target" className={inputCls} {...register("target_net_close_pct")} />
          </label>
        </div>

        {/* Live preview */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Preview</div>
          {mode === "growth_pct" && (
            <p className="text-slate-600 dark:text-slate-300">
              Baseline net sales <span className="font-mono">{baselineNetSales != null ? usd(baselineNetSales) : "—"}</span>
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
            Required / day — issued <span className="font-mono">{n1(issuedPerDay)}</span>, demoed <span className="font-mono">{n1(demoedPerDay)}</span>, closed <span className="font-mono">{n1(closedPerDay)}</span>
            {tnsli <= 0 && <span className="ml-2 text-amber-600">set Trailing NSLI to compute pace</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#0C2340] px-4 text-[13px] font-semibold text-white transition hover:bg-[#122739] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#0C2340] dark:hover:bg-slate-200"
          >
            <Check size={15} /> {pending ? "Saving…" : "Save goals"}
          </button>
          {dirty && !msg && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
              <Circle size={8} className="fill-current" /> Unsaved changes
            </span>
          )}
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{msg.text}</span>
          )}
        </div>
      </form>
    </ScCard>
  );
}
