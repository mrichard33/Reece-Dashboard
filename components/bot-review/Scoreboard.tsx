import { Card, CardContent } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { StatTile } from "@/components/tiles/StatTile";
import { NotEnoughData } from "./Overlays";
import { cn } from "@/lib/utils";
import { enoughData, MIN_SAMPLE } from "@/lib/botReview/core";
import type { WeeklyRow, TopIssue } from "@/lib/queries/botReview";

/**
 * Scoreboard — Phase 1 (basic): six tiles, top issues, weakest paths.
 *
 * The trend chart, fix report card and learning impact are Phase 3 and are
 * deliberately absent rather than stubbed: an empty chart reads as broken.
 *
 * Every rate obeys the honest-numbers rule (plan Part 8) — below 30 reviewed,
 * the number is replaced by "Not enough data yet" rather than shown as a
 * percentage nobody should act on.
 */

type Totals = {
  sent: number;
  reviewed: number;
  good: number;
  issues: number;
  unsafe: number;
  aiSum: number;
  aiN: number;
};

function fold(rows: WeeklyRow[]): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      sent: acc.sent + (r.sent ?? 0),
      reviewed: acc.reviewed + (r.reviewed ?? 0),
      good: acc.good + (r.good ?? 0),
      issues: acc.issues + (r.needs_work ?? 0) + (r.unsafe ?? 0),
      unsafe: acc.unsafe + (r.unsafe ?? 0),
      aiSum: acc.aiSum + (r.avg_ai_score != null ? r.avg_ai_score * (r.sent ?? 0) : 0),
      aiN: acc.aiN + (r.avg_ai_score != null ? (r.sent ?? 0) : 0),
    }),
    { sent: 0, reviewed: 0, good: 0, issues: 0, unsafe: 0, aiSum: 0, aiN: 0 },
  );
}

/** A delta only means something when BOTH windows cleared the minimum. */
function delta(now: number | null, prev: number | null, unit: string): { text: string; tone: "emerald" | "rose" | "slate" } {
  if (now == null || prev == null) return { text: "No comparison yet", tone: "slate" };
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return { text: `No change vs last week`, tone: "slate" };
  return {
    text: `${d > 0 ? "+" : ""}${d}${unit} vs last week`,
    tone: d > 0 ? "emerald" : "rose",
  };
}

export function Scoreboard({ weeks, issues }: { weeks: WeeklyRow[]; issues: TopIssue[] }) {
  const sorted = [...new Set(weeks.map((w) => w.et_week))].sort().reverse();
  const thisWeek = weeks.filter((w) => w.et_week === sorted[0]);
  const lastWeek = weeks.filter((w) => w.et_week === sorted[1]);

  const t = fold(thisWeek);
  const p = fold(lastWeek);

  const goodRate = enoughData(t.reviewed) ? (t.good / t.reviewed) * 100 : null;
  const prevGoodRate = enoughData(p.reviewed) ? (p.good / p.reviewed) * 100 : null;
  const per100 = enoughData(t.reviewed) ? (t.issues / t.reviewed) * 100 : null;
  const prevPer100 = enoughData(p.reviewed) ? (p.issues / p.reviewed) * 100 : null;
  const reviewedPct = t.sent > 0 ? (t.reviewed / t.sent) * 100 : null;
  const prevReviewedPct = p.sent > 0 ? (p.reviewed / p.sent) * 100 : null;
  const aiAvg = t.aiN > 0 ? t.aiSum / t.aiN : null;
  const prevAiAvg = p.aiN > 0 ? p.aiSum / p.aiN : null;

  // Worst first, and only paths that cleared the minimum get a rate.
  const paths = [...thisWeek].sort((a, b) => {
    const ar = enoughData(a.reviewed) ? (a.good_rate ?? 1) : 2;
    const br = enoughData(b.reviewed) ? (b.good_rate ?? 1) : 2;
    return ar - br;
  });

  const dGood = delta(goodRate, prevGoodRate, " pts");
  const dPer100 = delta(per100, prevPer100, "");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile
          label="Messages sent"
          value={t.sent.toLocaleString()}
          delta={delta(t.sent, lastWeek.length ? p.sent : null, "").text}
          deltaTone="slate"
          helpKey="botReview.messagesSent"
        />
        <StatTile
          label="Reviewed"
          value={reviewedPct == null ? "—" : Math.round(reviewedPct)}
          suffix={reviewedPct == null ? undefined : "%"}
          delta={delta(reviewedPct, prevReviewedPct, " pts").text}
          deltaTone={delta(reviewedPct, prevReviewedPct, " pts").tone}
          helpKey="botReview.reviewedPct"
        />
        <StatTile
          label="Good rate"
          value={goodRate == null ? "—" : Math.round(goodRate)}
          suffix={goodRate == null ? undefined : "%"}
          delta={goodRate == null ? `Under ${MIN_SAMPLE} reviewed` : dGood.text}
          deltaTone={goodRate == null ? "slate" : dGood.tone}
          helpKey="botReview.goodRate"
        />
        <StatTile
          label="Issues per 100"
          value={per100 == null ? "—" : Math.round(per100)}
          delta={per100 == null ? `Under ${MIN_SAMPLE} reviewed` : dPer100.text}
          // More issues is worse, so the tone is inverted against the raw delta.
          deltaTone={per100 == null ? "slate" : dPer100.tone === "emerald" ? "rose" : "emerald"}
          helpKey="botReview.issuesPer100"
        />
        <StatTile
          label="Unsafe"
          value={t.unsafe}
          delta={delta(t.unsafe, lastWeek.length ? p.unsafe : null, "").text}
          deltaTone={t.unsafe > 0 ? "rose" : "emerald"}
          helpKey="botReview.unsafe"
        />
        <StatTile
          label="AI judge average"
          value={aiAvg == null ? "—" : Math.round(aiAvg)}
          delta={delta(aiAvg, prevAiAvg, "").text}
          deltaTone={delta(aiAvg, prevAiAvg, "").tone}
          helpKey="botReview.aiJudgeAverage"
        />
      </div>

      <section className="flex flex-col gap-2">
        <SubHeader title="Top issues" helpKey="botReview.topIssues" />
        <Card>
          <CardContent>
            {issues.every((i) => i.this_week === 0 && i.last_week === 0) ? (
              <p className="py-2 text-sm text-slate-500 dark:text-slate-400">
                No reasons flagged yet. They appear here as reviewers work through the queue.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {issues.filter((i) => i.this_week > 0 || i.last_week > 0).map((i) => {
                  const max = Math.max(...issues.map((x) => x.this_week), 1);
                  return (
                    <li key={i.reason_code} className="flex items-center gap-3">
                      <span className="w-48 shrink-0 truncate text-sm text-slate-700 dark:text-slate-200">{i.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-navy-600" style={{ width: `${(i.this_week / max) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right font-mono text-xs text-slate-700 dark:text-slate-200">
                        {i.this_week}
                      </span>
                      <span
                        className={cn(
                          "w-12 shrink-0 text-right text-xs",
                          i.delta > 0 ? "text-rose-600" : i.delta < 0 ? "text-emerald-600" : "text-slate-400",
                        )}
                      >
                        {i.delta > 0 ? `▲ ${i.delta}` : i.delta < 0 ? `▼ ${Math.abs(i.delta)}` : "— 0"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <SubHeader title="Weakest paths" helpKey="botReview.weakestPaths" />
        <Card>
          <CardContent>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Minimum {MIN_SAMPLE} reviewed to show a rate.
            </p>
            {paths.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No messages in this window yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {paths.map((p2) => {
                  const ok = enoughData(p2.reviewed) && p2.good_rate != null;
                  const pct = ok ? Math.round((p2.good_rate as number) * 100) : 0;
                  return (
                    <li key={`${p2.path}-${p2.channel}`} className="flex items-center gap-3">
                      <span className="w-64 shrink-0 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                        {p2.path}
                        <span className="ml-1 font-sans text-slate-400">{p2.channel}</span>
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            !ok ? "bg-slate-300 dark:bg-slate-700" : pct < 60 ? "bg-rose-500" : pct < 75 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${ok ? pct : 100}%` }}
                        />
                      </div>
                      <span className="w-32 shrink-0 text-right text-xs">
                        {ok ? (
                          <span className="font-mono text-slate-700 dark:text-slate-200">{pct}%</span>
                        ) : (
                          <NotEnoughData reviewed={p2.reviewed} />
                        )}
                      </span>
                      <span className="w-16 shrink-0 text-right text-[11px] text-slate-400">n={p2.reviewed}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/**
 * A section heading with its info popover. SectionHeader is the page-level
 * title and takes no helpKey, so the sections inside a page use this instead —
 * every section carries help (design brief §2, "every tile and section header").
 */
function SubHeader({ title, helpKey }: { title: string; helpKey: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <h2 className="font-display text-base font-semibold text-navy-900 dark:text-white">{title}</h2>
      <InfoPopover helpKey={helpKey} />
    </div>
  );
}
