"use client";

import { useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { StatTile } from "@/components/tiles/StatTile";
import { RetractModal } from "./Overlays";
import { retractReview, undoDismissal } from "@/lib/actions/botReview";
import { contactLabel, formatEt, PAGE_SIZE } from "@/lib/botReview/core";
import type { CompletedRow, CompletedSummary, DismissalRow } from "@/lib/queries/botReview";

/**
 * Completed — what has already been reviewed (increment 2 §6E).
 *
 * Phase 1 had no way to see your own work. A reviewer who scored something
 * wrong could not find it again, and nobody could answer "did anyone look at
 * this week's messages" without the SQL editor.
 *
 * Three sub-views behind one tab, because they answer the same question from
 * different angles:
 *   reviews   — what was scored (everyone who may review)
 *   dismissed — what was set aside, and the way back (everyone; undo is gated)
 *   retracted — what was removed and why (admins only; it is an audit trail)
 *
 * The table is server-rendered and paged; this component owns only the filter
 * controls, the row actions and the two confirms.
 */

const VERDICT_TONE: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  needs_work: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  unsafe: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900",
};

const VERDICT_LABEL: Record<string, string> = {
  good: "Good",
  needs_work: "Needs work",
  unsafe: "Unsafe",
};

export function CompletedTable({
  rows,
  total,
  page,
  summary,
  dismissals,
  reviewers,
  myEmail,
  isAdmin,
  canPickReviewer,
  canUndoDismiss,
  canSeeRetracted,
}: {
  rows: CompletedRow[];
  total: number;
  page: number;
  summary: CompletedSummary;
  dismissals: DismissalRow[];
  reviewers: string[];
  myEmail: string;
  isAdmin: boolean;
  canPickReviewer: boolean;
  canUndoDismiss: boolean;
  canSeeRetracted: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retracting, setRetracting] = useState<CompletedRow | null>(null);
  const [retractBusy, setRetractBusy] = useState(false);

  const show = sp.get("show") ?? "reviews";

  function set(param: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (!value || value === "all") next.delete(param);
    else next.set(param, value);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}` as Route);
  }

  function openInReview(row: CompletedRow) {
    if (row.context_id == null) return;
    router.push(`/bot-review?lane=everything&ctx=${row.context_id}` as Route);
  }

  async function onConfirmRetract(reason: string) {
    if (!retracting) return;
    setRetractBusy(true);
    const res = await retractReview({
      id: retracting.feedback_id,
      reason,
      reviewerEmail: retracting.reviewer_email,
    });
    setRetractBusy(false);
    setRetracting(null);
    if (!res.ok) setErrorMsg(res.error ?? "Could not remove the review.");
    else router.refresh();
  }

  async function onUndoDismissal(id: number) {
    setBusyId(id);
    const res = await undoDismissal(id);
    setBusyId(null);
    if (!res.ok) setErrorMsg(res.error ?? "Could not undo that dismissal.");
    else router.refresh();
  }

  const mine = myEmail.trim().toLowerCase();
  const canRemove = (row: CompletedRow) =>
    isAdmin || (row.reviewer_email ?? "").trim().toLowerCase() === mine;

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      {errorMsg && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Reviews this week" value={summary.weekTotal} helpKey="botReview.completedWeek" />
        <StatTile label="Your reviews this week" value={summary.weekMine} helpKey="botReview.completedMine" />
        <StatTile
          label="Good / Needs work / Unsafe"
          value={`${summary.good} / ${summary.needsWork} / ${summary.unsafe}`}
          helpKey="botReview.completedSplit"
        />
        <StatTile label="Teaching examples saved" value={summary.teaching} helpKey="botReview.completedTeaching" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { key: "reviews", label: "Reviews" },
            { key: "dismissed", label: "Dismissed" },
            ...(canSeeRetracted ? [{ key: "retracted", label: "Retracted" }] : []),
          ].map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => set("show", s.key === "reviews" ? "all" : s.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                show === s.key
                  ? "bg-white text-navy-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-navy-800 dark:text-slate-300 dark:hover:text-white",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {show !== "dismissed" && (
          <>
            {/* A team member has no one to choose between — the query layer pins
                them to their own email, so offering the control would be a lie. */}
            {canPickReviewer && (
              <select
                aria-label="Reviewer"
                value={sp.get("reviewer") ?? myEmail}
                onChange={(e) => set("reviewer", e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value={myEmail}>Me</option>
                <option value="everyone">Everyone</option>
                {reviewers
                  .filter((r) => r.toLowerCase() !== mine)
                  .map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
              </select>
            )}
            <select
              aria-label="Verdict"
              value={sp.get("verdict") ?? "all"}
              onChange={(e) => set("verdict", e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">Any verdict</option>
              <option value="good">Good</option>
              <option value="needs_work">Needs work</option>
              <option value="unsafe">Unsafe</option>
            </select>
            <select
              aria-label="Lane"
              value={sp.get("lane") ?? "all"}
              onChange={(e) => set("lane", e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">Any lane</option>
              <option value="must_review">Must review</option>
              <option value="spot_check">Spot check</option>
              <option value="none">Neither</option>
            </select>
            <select
              aria-label="Date"
              value={sp.get("date") ?? "all"}
              onChange={(e) => set("date", e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">Any time</option>
              <option value="today">Today</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </>
        )}
      </div>

      {show === "dismissed" ? (
        <DismissedList
          rows={dismissals}
          canUndo={canUndoDismiss}
          busyId={busyId}
          onUndo={onUndoDismissal}
        />
      ) : (
        <Card>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {show === "retracted"
                  ? "No reviews have been removed."
                  : "No reviews yet. Head to the Review tab to score your first message."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="py-2 pr-3 font-medium">Reviewer</th>
                      <th className="py-2 pr-3 font-medium">Lead</th>
                      <th className="py-2 pr-3 font-medium">Channel</th>
                      <th className="py-2 pr-3 font-medium">Rule</th>
                      <th className="py-2 pr-3 font-medium">Verdict</th>
                      <th className="py-2 pr-3 font-medium">Reasons</th>
                      <th className="py-2 pr-3 font-medium">Counts</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.feedback_id}
                        onClick={() => openInReview(row)}
                        className="cursor-pointer border-b border-slate-100 align-top last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      >
                        <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-600 dark:text-slate-300">
                          {formatEt(row.created_at)}
                          {row.was_edited && (
                            <span className="ml-1 text-[10px] italic text-slate-400">edited since</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-600 dark:text-slate-300">{row.reviewer_email}</td>
                        <td className="py-2 pr-3 text-xs text-navy-900 dark:text-white">{contactLabel(row)}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 dark:text-slate-300">{row.channel ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {row.rule_applied ?? row.workflow_code ?? "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={cn(
                              "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                              VERDICT_TONE[row.verdict] ?? "bg-slate-100 text-slate-600 ring-slate-200",
                            )}
                          >
                            {VERDICT_LABEL[row.verdict] ?? row.verdict}
                          </span>
                          <span className="ml-1 whitespace-nowrap text-[11px]" aria-label="flags">
                            {row.better_text && <span title="Rewrite">✏️</span>}
                            {row.note && <span title="Note">📌</span>}
                            {row.gold && <span title="Teaching example">⭐</span>}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-600 dark:text-slate-300">
                          {row.reason_labels?.length ? row.reason_labels.join(", ") : "—"}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {/* An uncalibrated reviewer's work is stored and shown,
                              it just does not move the rates — saying so here is
                              what keeps that from feeling like a rejection. */}
                          {row.counts ? (
                            <span className="text-slate-600 dark:text-slate-300">Counts</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">Not counted yet</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {show === "retracted" ? (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              by {row.retracted_by ?? "—"}
                              {row.retract_reason ? ` · ${row.retract_reason}` : ""}
                            </span>
                          ) : (
                            canRemove(row) && (
                              <span className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openInReview(row)}
                                  className="text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRetracting(row)}
                                  className="text-xs font-medium text-rose-700 hover:underline dark:text-rose-400"
                                >
                                  Remove review
                                </button>
                              </span>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {show !== "dismissed" && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Page {page} of {lastPage} · {total} review{total === 1 ? "" : "s"}
          </span>
          <span className="flex gap-3">
            {page > 1 && (
              <button type="button" onClick={() => set("page", String(page - 1))} className="font-medium text-navy-700 hover:underline dark:text-navy-200">
                ← Newer
              </button>
            )}
            {page < lastPage && (
              <button type="button" onClick={() => set("page", String(page + 1))} className="font-medium text-navy-700 hover:underline dark:text-navy-200">
                Older →
              </button>
            )}
          </span>
        </div>
      )}

      {retracting && (
        <RetractModal
          verdict={VERDICT_LABEL[retracting.verdict] ?? retracting.verdict}
          at={formatEt(retracting.created_at)}
          busy={retractBusy}
          onCancel={() => setRetracting(null)}
          onConfirm={onConfirmRetract}
        />
      )}
    </div>
  );
}

function DismissedList({
  rows,
  canUndo,
  busyId,
  onUndo,
}: {
  rows: DismissalRow[];
  canUndo: boolean;
  busyId: number | null;
  onUndo: (id: number) => void;
}) {
  return (
    <Card>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nothing has been set aside.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-navy-900 dark:text-white">
                    {d.scope === "message" ? "One message" : "Whole conversation"}
                    <span className="ml-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {d.scope === "message" ? `ctx ${d.context_id}` : d.ghl_contact_id}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {d.dismissed_by} · {formatEt(d.dismissed_at)}
                    {d.reason ? ` · ${d.reason}` : ""}
                  </p>
                </div>
                {canUndo && (
                  <button
                    type="button"
                    disabled={busyId === d.id}
                    onClick={() => onUndo(d.id)}
                    className="shrink-0 text-xs font-medium text-navy-700 hover:underline disabled:opacity-50 dark:text-navy-200"
                  >
                    {busyId === d.id ? "Undoing…" : "Undo"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
