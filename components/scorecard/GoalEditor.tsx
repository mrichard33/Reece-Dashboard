"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Check, Circle, Info } from "lucide-react";
import { saveScorecardGoals } from "@/lib/actions/scorecard";
import { GoalSchema } from "@/lib/scorecard/goalSchema";
import type {
  ScorecardGoalsEditorData,
  MarketGoalEntry,
} from "@/lib/queries/scorecard";
import { marketLabel, SCORECARD_MARKETS } from "@/lib/scorecard/markets";
import { usd, num, monthLabelFull } from "@/lib/utils";
import { ScCard } from "./ScCard";

type FieldSpec = { name: string; label: string; step?: string; prefix?: string };

// monthly_goal_dollars / growth_pct are handled in the Goal-mode section; these are
// the always-numeric remaining inputs.
const FIELDS: FieldSpec[] = [
  { name: "working_days", label: "Working Days", step: "1" },
  { name: "target_close_pct", label: "Target Close %", step: "0.1" },
  { name: "target_demo_pct", label: "Target Demo %", step: "0.1" },
  { name: "target_good_rate_pct", label: "Target Good Rate %", step: "0.1" },
  { name: "target_ko_pct", label: "Target KO %", step: "0.1" },
];

/** Short label for the trailing rate window (transparency for the NSLI figure). */
const rateWindowLabel = (w: string | null): string =>
  w === "trailing_3" ? "trailing 3mo"
  : w === "trailing_6" ? "trailing 6mo"
  : w === "trailing_12" ? "trailing 12mo"
  : w === "company" ? "company-wide" : "—";

const n1 = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));
const s = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : String(v);

const EMPTY_FORM: Record<string, string> = {
  goal_mode: "dollars", monthly_goal_dollars: "", growth_pct: "", working_days: "",
  trailing_nsli: "", target_close_pct: "", target_demo_pct: "", target_good_rate_pct: "",
  target_ko_pct: "", target_issue_pct: "", target_net_close_pct: "",
};

/** Form values for a (market, month) — prefers the frozen monthly row, else the live goal. */
function formValuesFor(
  entry: MarketGoalEntry | undefined,
  month: string,
  monthly: ScorecardGoalsEditorData["monthly"],
): Record<string, string> {
  if (!entry) return { ...EMPTY_FORM };
  const g = entry.goals;
  const frozen = monthly.find(
    (r) => r.market === entry.market && String(r.goal_month).slice(0, 10) === month,
  );
  return {
    goal_mode: frozen ? frozen.goal_mode : g.goal_mode,
    monthly_goal_dollars: s(frozen ? frozen.goal_dollars : g.monthly_goal_dollars),
    growth_pct: s(frozen ? frozen.growth_pct : g.growth_pct),
    working_days: s(frozen ? frozen.working_days : g.working_days),
    trailing_nsli: s(frozen ? frozen.trailing_nsli ?? g.trailing_nsli : g.trailing_nsli),
    target_close_pct: s(frozen ? frozen.target_close_pct ?? g.target_close_pct : g.target_close_pct),
    target_demo_pct: s(frozen ? frozen.target_demo_pct ?? g.target_demo_pct : g.target_demo_pct),
    target_good_rate_pct: s(frozen ? frozen.target_good_rate_pct ?? g.target_good_rate_pct : g.target_good_rate_pct),
    target_ko_pct: s(frozen ? frozen.target_ko_pct ?? g.target_ko_pct : g.target_ko_pct),
    // Optional funnel targets aren't month-frozen — always from the live row.
    target_issue_pct: s(g.target_issue_pct),
    target_net_close_pct: s(g.target_net_close_pct),
  };
}

/** Effective $ goal implied by the current form values for a market. */
function effectiveFromForm(w: Record<string, string>, baseline: number | null): number {
  if (w.goal_mode === "growth_pct") {
    const g = Number(w.growth_pct);
    return baseline != null && Number.isFinite(g) ? Math.round(baseline * (1 + g / 100)) : 0;
  }
  return Number(w.monthly_goal_dollars) || 0;
}

/**
 * Admin-only per-market / per-month goal editor. A Market + Month selector switch the
 * form between every market's live goal and its frozen monthly history (client-side).
 * Saving dual-writes the live goal and the month's frozen row. An amber banner warns
 * when the 7 markets' goals don't sum to the All-Markets (REECE) goal.
 */
export function GoalEditor({
  data,
  initialMarket = "REECE",
}: {
  data: ScorecardGoalsEditorData;
  initialMarket?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const byMarket = useMemo(() => {
    const m = new Map<string, MarketGoalEntry>();
    for (const e of data.markets) m.set(e.market, e);
    return m;
  }, [data.markets]);

  // The company (REECE) goal is derived from the offices and not editable, so the
  // editor always opens on an office.
  const fallbackMarket = SCORECARD_MARKETS[0]?.code ?? "STPET_MKT";
  const knownMarket =
    initialMarket !== "REECE" && byMarket.has(initialMarket) ? initialMarket : fallbackMarket;
  const [market, setMarket] = useState(knownMarket);
  const [month, setMonth] = useState(data.defaultMonth);

  const entry = byMarket.get(market) ?? data.markets[0];
  const baseline = entry?.baselineNetSales ?? null;

  const initial = useMemo(
    () => formValuesFor(entry, month, data.monthly),
    [entry, month, data.monthly],
  );

  const { register, handleSubmit, watch, reset } = useForm<Record<string, string>>({
    defaultValues: initial,
  });

  // Repopulate when market or month changes.
  const lastKey = useRef(`${market}|${month}`);
  useEffect(() => {
    const key = `${market}|${month}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      reset(initial);
      setMsg(null);
    }
  }, [market, month, initial, reset]);

  const w = watch();
  const mode = w.goal_mode === "growth_pct" ? "growth_pct" : "dollars";
  const growth = Number(w.growth_pct);
  const effectiveGoal = effectiveFromForm(w, baseline);
  const wd = Number(w.working_days) || 1;
  // NSLI is CALCULATED (net sales ÷ leads issued) from the market's actuals — it is
  // read-only here and drives "leads needed to hit the goal" (leads = goal ÷ NSLI).
  const nsli = entry?.nsli ?? 0;
  const demoPct = Number(w.target_demo_pct) || 0;
  const closePct = Number(w.target_close_pct) || 0;
  const leadsNeeded = nsli > 0 ? Math.round(effectiveGoal / nsli) : null;
  const issuedPerDay = leadsNeeded != null ? leadsNeeded / wd : null;
  const demoedPerDay = issuedPerDay != null ? issuedPerDay * (demoPct / 100) : null;
  const closedPerDay = demoedPerDay != null ? demoedPerDay * (closePct / 100) : null;

  // Company (All Markets) goal = Σ offices, using the in-form value for the selected
  // office and server values for the rest — shown read-only; never edited directly.
  const companyTotal = SCORECARD_MARKETS.reduce(
    (a, m) => a + (m.code === market ? effectiveGoal : byMarket.get(m.code)?.effectiveGoal ?? 0),
    0,
  );

  const dirty = Object.keys(initial).some((k) => (w[k] ?? "") !== (initial[k] ?? ""));

  const onSubmit = handleSubmit((raw) => {
    setMsg(null);
    const m = raw.goal_mode === "growth_pct" ? "growth_pct" : "dollars";
    const candidate = {
      market,
      goal_month: month,
      goal_mode: m,
      monthly_goal_dollars: Number(raw.monthly_goal_dollars) || 0,
      growth_pct: raw.growth_pct === "" ? null : Number(raw.growth_pct),
      working_days: Number(raw.working_days),
      // NSLI is calculated, not entered — send the computed value (the server
      // recomputes it authoritatively regardless).
      trailing_nsli: nsli,
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
      setMsg(
        res.ok
          ? { ok: true, text: `Saved ${marketLabel(market)} · ${monthLabelFull(month)}.` }
          : { ok: false, text: res.error ?? "Save failed." },
      );
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
      action={entry?.goals.updated_by ? <span className="text-[11.5px] text-slate-400">Last edited by {entry.goals.updated_by}</span> : undefined}
    >
      <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
        {/* Market + Month scope */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={fieldWrap}>
            <span className={labelCls}>Market</span>
            <select className={inputCls} value={market} onChange={(e) => setMarket(e.target.value)}>
              {SCORECARD_MARKETS.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className={fieldWrap}>
            <span className={labelCls}>Month</span>
            <select className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)}>
              {data.months.map((mo) => (
                <option key={mo} value={mo}>{monthLabelFull(mo)}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Company total — read-only: the company goal is the sum of the offices. */}
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          <Info size={15} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            Company (All Markets) goal is the sum of the offices:{" "}
            <span className="font-mono font-semibold">{usd(companyTotal)}</span>. Edit an office to change it — the company total isn&apos;t set directly.
          </span>
        </div>

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
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Preview — {marketLabel(market)} · {monthLabelFull(month)}</div>
          {mode === "growth_pct" && (
            <p className="text-slate-600 dark:text-slate-300">
              Baseline net sales <span className="font-mono">{baseline != null ? usd(baseline) : "—"}</span>
              {" × "}
              <span className="font-mono">{Number.isFinite(growth) ? `${growth >= 0 ? "+" : ""}${growth}%` : "—"}</span>
              {" → goal "}
              <span className="font-mono font-semibold">{usd(effectiveGoal)}</span>
            </p>
          )}
          {mode === "dollars" && (
            <p className="text-slate-600 dark:text-slate-300">
              Monthly goal <span className="font-mono font-semibold">{usd(effectiveGoal)}</span>
            </p>
          )}
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            NSLI <span className="font-mono">{nsli > 0 ? usd(nsli) : "—"}</span>{" "}
            <span className="text-[10.5px] uppercase tracking-wider text-slate-400">calculated</span>
            {entry?.rateWindow && (
              <span className="text-[10.5px] text-slate-400"> ({rateWindowLabel(entry.rateWindow)} · n={entry.rateSampleN})</span>
            )}
            {" · leads needed "}
            <span className="font-mono font-semibold">{leadsNeeded != null ? num(leadsNeeded) : "—"}</span>
            {nsli <= 0 && <span className="ml-2 text-amber-600">no issued history yet — leads / pace unavailable</span>}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Required / day — issued <span className="font-mono">{n1(issuedPerDay)}</span>, demoed <span className="font-mono">{n1(demoedPerDay)}</span>, closed <span className="font-mono">{n1(closedPerDay)}</span>
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
