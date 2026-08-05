"use client";

import { useMemo, useState, useTransition } from "react";
import { Wand2, Check, RefreshCw } from "lucide-react";
import { usd, num, parseMoney } from "@/lib/utils";
import { marketLabel, SCORECARD_MARKETS } from "@/lib/scorecard/markets";
import {
  previewGoalDistribution,
  commitGoalDistribution,
  redistributeGoalRemainder,
  type DistributionPreview,
} from "@/lib/actions/goalDistribution";
import type { ScorecardGoalsEditorData } from "@/lib/queries/scorecard";
import { ScCard } from "./ScCard";
import { MoneyInput } from "./MoneyInput";

/**
 * Top-down goal distribution (ruled 2026-08-04): Mark enters ONE company goal;
 * the split across the 6 markets by trailing-Net-Sales share is PREVIEWED
 * first (zero-history markets flagged amber) and committed only on explicit
 * confirm — nothing writes from the preview.
 *
 * After a commit, hand edits in the Goals editor below remain authoritative;
 * the variance strip surfaces "distributed target vs current office sum" and
 * offers the explicit "redistribute remainder across untouched offices"
 * action — never automatic.
 */

const monthLabel = (iso: string): string => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) || 1;
  return new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

export function GoalDistributor({ data }: { data: ScorecardGoalsEditorData }) {
  const dist = data.distributions;
  const companySum = data.markets.find((e) => e.market === "REECE")?.effectiveGoal ?? 0;

  const [month, setMonth] = useState(data.defaultMonth);
  const [windowMonths, setWindowMonths] = useState(6);
  const [goalInput, setGoalInput] = useState<string>(companySum > 0 ? String(companySum) : "");
  const [preview, setPreview] = useState<DistributionPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Variance vs the latest committed run for the selected month: current live
  // office sum (primary rows only — what the company derives from) vs the
  // distributed target. Surfaced, never auto-corrected.
  const latest = dist.latestByMonth[month];
  const variance = useMemo(() => {
    if (!latest) return null;
    const primaries = new Set(SCORECARD_MARKETS.map((m) => m.sources[0] ?? m.code));
    const currentSum = data.markets
      .filter((e) => primaries.has(e.market))
      .reduce((a, e) => a + e.effectiveGoal, 0);
    const target = latest.companyGoalCents / 100;
    return { target, currentSum, delta: currentSum - target };
  }, [latest, data.markets]);

  if (!dist.available) return null; // migration 0017 not applied yet

  const runPreview = () => {
    setMsg(null);
    const dollars = parseMoney(goalInput) ?? 0;
    startTransition(async () => {
      const res = await previewGoalDistribution({ companyGoalDollars: dollars, goalMonth: month, windowMonths });
      setPreview(res);
      if (!res.ok) setMsg({ ok: false, text: res.error ?? "Preview failed." });
    });
  };

  const runCommit = () => {
    if (!preview?.ok) return;
    setMsg(null);
    startTransition(async () => {
      const res = await commitGoalDistribution({
        companyGoalDollars: preview.companyGoalDollars,
        goalMonth: month,
        windowMonths,
      });
      setMsg(
        res.ok
          ? { ok: true, text: `Distributed ${usd(preview.companyGoalDollars ?? 0)} across the offices for ${monthLabel(month)}. Reload to see the refreshed goals.` }
          : { ok: false, text: res.error ?? "Commit failed." },
      );
      if (res.ok) setPreview(null);
    });
  };

  const runRedistribute = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await redistributeGoalRemainder({ goalMonth: month });
      setMsg(
        res.ok
          ? { ok: true, text: "Remainder redistributed across the untouched offices. Reload to see the refreshed goals." }
          : { ok: false, text: res.error ?? "Redistribute failed." },
      );
    });
  };

  const inputCls =
    "h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-[13.5px] tabular text-slate-800 outline-none transition focus:ring-2 focus:ring-[#274560] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const labelCls = "mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <ScCard id="sc-goal-distributor" title="Distribute company goal">
      <div className="space-y-4 px-5 py-4">
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Enter ONE company goal — it is split across the 6 markets by each market&apos;s share of
          trailing Net Sales (largest-remainder in cents; office goals sum to the company goal
          exactly). Review the split below before committing; nothing writes until you confirm.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={labelCls}>Company goal ($, month)</span>
            <MoneyInput
              ariaLabel="Company goal dollars"
              className={inputCls}
              value={parseMoney(goalInput)}
              onChange={(next) => setGoalInput(next == null ? "" : String(next))}
              placeholder="e.g. 9,000,000"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Goal month</span>
            <select className={inputCls} value={month} onChange={(e) => { setMonth(e.target.value); setPreview(null); }}>
              {data.months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Basis window (trailing months)</span>
            <select className={inputCls} value={windowMonths} onChange={(e) => { setWindowMonths(Number(e.target.value)); setPreview(null); }}>
              {[3, 6, 12].map((w) => (
                <option key={w} value={w}>{w} months</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runPreview}
            disabled={pending || !((parseMoney(goalInput) ?? 0) > 0)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <Wand2 size={14} /> {pending ? "Working…" : "Preview split"}
          </button>
          {preview?.ok && (
            <button
              type="button"
              onClick={runCommit}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0C2340] px-3 text-[12.5px] font-semibold text-white transition hover:bg-[#122739] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[#0C2340] dark:hover:bg-slate-200"
            >
              <Check size={14} /> Commit distribution
            </button>
          )}
        </div>

        {preview?.ok && preview.rows && (
          <div className="overflow-x-auto rounded-md border border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[480px] text-[12.5px]">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2 text-left">Market</th>
                  <th className="px-3 py-2 text-right">Trailing net ({preview.windowStart} → {preview.windowEnd})</th>
                  <th className="px-3 py-2 text-right">Share</th>
                  <th className="px-3 py-2 text-right">Allocated goal</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular">
                {preview.rows.map((r) => (
                  <tr key={r.code} className="border-t border-slate-50 dark:border-slate-900">
                    <td className="px-3 py-1.5 font-sans font-medium text-slate-700 dark:text-slate-200">
                      {r.label}
                      {r.zeroHistory && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          no trailing history — allocated $0
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{usd(r.trailingNetDollars)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{(r.share * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-900 dark:text-slate-100">{usd(r.allocatedDollars)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="px-3 py-1.5 font-sans font-semibold text-slate-700 dark:text-slate-200">Company (Σ offices)</td>
                  <td />
                  <td />
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                    {usd(preview.rows.reduce((a, r) => a + r.allocatedDollars, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {variance && Math.abs(variance.delta) >= 1 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
            <span>
              Distributed target <span className="font-mono font-semibold">{usd(variance.target)}</span>
              {" · current office sum "}
              <span className="font-mono font-semibold">{usd(variance.currentSum)}</span>
              {" · variance "}
              <span className="font-mono font-semibold">{variance.delta >= 0 ? "+" : ""}{usd(variance.delta)}</span>
              {" — an office was edited after distribution (edits are authoritative; the company goal stays the sum of the offices)."}
            </span>
            <button
              type="button"
              onClick={runRedistribute}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded border border-amber-300 bg-white px-2 text-[11.5px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-transparent dark:text-amber-200"
            >
              <RefreshCw size={12} /> Redistribute remainder across untouched offices
            </button>
          </div>
        )}

        {msg && (
          <p className={`text-[12.5px] ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-brick"}`}>{msg.text}</p>
        )}

        {latest && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Latest run for {monthLabel(month)}: {usd(latest.companyGoalCents / 100)} · basis{" "}
            {latest.basis === "redistribute_remainder" ? "remainder redistribution" : `trailing net`} ·{" "}
            {num(Object.keys(latest.allocations).length)} markets · {latest.createdAt.slice(0, 10)}
          </p>
        )}
      </div>
    </ScCard>
  );
}
