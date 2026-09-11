import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { FilterBar } from "@/components/bot-review/FilterBar";
import { ReviewWorkspace } from "@/components/bot-review/ReviewWorkspace";
import { Scoreboard } from "@/components/bot-review/Scoreboard";
import { CompletedTable } from "@/components/bot-review/CompletedTable";
import { CalibrationBanner } from "@/components/bot-review/Overlays";
import { PromptList } from "@/components/bot-review/prompts/PromptList";
import { PromptEditor } from "@/components/bot-review/prompts/PromptEditor";
import { getPromptList, getPromptDetail } from "@/lib/queries/prompts";
import {
  ReviewTabSkeleton,
  TableTabSkeleton,
  ScoreboardTabSkeleton,
} from "@/components/bot-review/Skeletons";
import {
  getQueue,
  getContext,
  getConversation,
  getThreads,
  getMyFeedback,
  getReasons,
  getCalibration,
  getHeaderCounts,
  getScoreboard,
  getLaneCounts,
  getLaneScoreboard,
  getCompleted,
  getCompletedSummary,
  getDismissals,
  type MyFeedback,
} from "@/lib/queries/botReview";
import {
  resolveTab,
  visibleTabs,
  canStopBot,
  canReview,
  canSeeOtherReviewers,
  canSeeRetracted,
  canUndoDismiss,
  buildTimeline,
  resolveLane,
  TABS,
  type TabKey,
  type LaneKey,
} from "@/lib/botReview/core";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Bot Review — Phase 1.
 *
 * Access, in three lines, because this page drives writes to bot behavior:
 *   exec-only → sent to /approvals; they never see it.
 *   team      → Review + Compare only; any other tab resolves back to Review.
 *   operator  → every tab. Admin adds the approval actions (Phase 2+).
 * LP MCP re-checks all of it on every write. Hiding a tab is the courtesy.
 *
 * Phase 1 ships Review and the basic Scoreboard. "What the bot has learned" is
 * now the prompt editor — the live nurture prompts, editable as drafts and
 * promoted deliberately. Compare and Fixes remain Phase 2–3 and render a short
 * note saying which phase builds them, rather than an empty tab that reads as
 * broken — the same choice the Command Center made for its Stale-issue lane.
 */
export default async function BotReviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  // The flag is the off switch for the whole feature — no revert needed to
  // pull it, and the sidebar reads the same value so the two never disagree.
  if (process.env.NEXT_PUBLIC_BOT_REVIEW_ENABLED === "false") redirect("/overview");

  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  if (ctx.isExecOnly) redirect("/approvals");
  if (ctx.role !== "operator" && ctx.role !== "team") redirect("/overview");

  const sp = await searchParams;
  const tab: TabKey = resolveTab(one(sp.tab), ctx);
  const allowed = visibleTabs(ctx);
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  const header = await getHeaderCounts();

  // sql/103 + sql/104 are applied by hand, so this page can legitimately deploy
  // before the views exist. Say which step is missing instead of rendering an
  // empty queue that looks like there is nothing to review.
  if (header.needsMigration) {
    return (
      <>
        <TopBar email={ctx.email} role={ctx.role} title="Bot review" />
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <SectionHeader title="Bot review" subtitle="Score bot messages. Approved lessons improve future ones." />
          <Card>
            <CardContent>
              <p className="text-sm font-semibold text-navy-900 dark:text-white">Not migrated yet.</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Apply <span className="font-mono text-xs">sql/103_bot_feedback_core.sql</span> and{" "}
                <span className="font-mono text-xs">sql/104_bot_review_views.sql</span> in the LP Supabase SQL
                editor, then reload. Nothing else on the dashboard is affected.
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar email={ctx.email} role={ctx.role} title="Bot review" />
      <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 p-4 lg:p-6">
        <SectionHeader
          title="Bot review"
          subtitle="Score bot messages. Approved lessons improve future ones."
          action={
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <span className="font-mono font-semibold text-navy-900 dark:text-white">{header.toReview}</span>
              to review
              {header.reviewedPct != null && (
                <>
                  ·{" "}
                  <span className="font-mono font-semibold text-navy-900 dark:text-white">{header.reviewedPct}%</span>
                  reviewed this week
                </>
              )}
            </span>
          }
        />

        <nav className="flex flex-wrap items-stretch gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.filter((t) => allowed.includes(t.key)).map((t) => (
            <Link
              key={t.key}
              href={(t.key === "review" ? "/bot-review" : `/bot-review?tab=${t.key}`) as Route}
              className={
                t.key === tab
                  ? "border-b-2 border-navy-800 px-3 py-2.5 text-sm font-semibold text-navy-900 dark:border-navy-300 dark:text-white"
                  : "border-b-2 border-transparent px-3 py-2.5 text-sm text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-white"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/*
          * Keyed on the tab, not on the full query string. A key that changed
          * with ?ctx= would drop back to the skeleton on every message click;
          * with a stable key React keeps the previous message on screen while
          * the next one streams, which is what makes clicking through the queue
          * feel immediate. Switching tabs IS a new view, so that one re-keys.
          */}
        {tab === "review" && (
          <Suspense key="review" fallback={<ReviewTabSkeleton />}>
            <ReviewTab ctx={ctx} sp={sp} page={page} />
          </Suspense>
        )}
        {tab === "completed" && (
          <Suspense key="completed" fallback={<TableTabSkeleton />}>
            <CompletedTab ctx={ctx} sp={sp} page={page} />
          </Suspense>
        )}
        {tab === "scoreboard" && (
          <Suspense key="scoreboard" fallback={<ScoreboardTabSkeleton />}>
            <ScoreboardTab />
          </Suspense>
        )}
        {tab === "learned" && (
          <Suspense key="learned" fallback={<ReviewTabSkeleton />}>
            <PromptsTab ctx={ctx} sp={sp} />
          </Suspense>
        )}
        {(tab === "compare" || tab === "fixes") && <ComingIn tab={tab} />}
      </div>
    </>
  );
}

async function ReviewTab({
  ctx,
  sp,
  page,
}: {
  ctx: Awaited<ReturnType<typeof getAccessContext>> & object;
  sp: Search;
  page: number;
}) {
  /*
   * Kick off everything that does not depend on the lane BEFORE awaiting the
   * lane counts. Reasons and calibration were previously awaited in a
   * Promise.all that could not start until getLaneCounts() had resolved, which
   * put two independent round trips on the critical path for no reason. Started
   * here they overlap with the lane counts and the queue, and are almost always
   * already settled by the time they are awaited below.
   */
  const reasonsPromise = getReasons();
  const calibrationPromise = getCalibration(ctx.email);

  const laneCounts = await getLaneCounts();

  /*
   * Which lane the reviewer lands in.
   *
   * Must review is the default — it is the work that matters. When it is empty
   * and the reviewer has not asked for a specific lane, fall through to Spot
   * check rather than showing them an empty screen: "nothing needs you" is good
   * news, and the right next action is the sample, not the exit.
   *
   * An EXPLICIT ?lane= is always honored, empty or not. A reviewer who clicked
   * Must review and got moved somewhere else would not trust the control again.
   */
  const asked = one(sp.lane);
  const lane: LaneKey =
    asked == null && laneCounts.must_review === 0 && laneCounts.spot_check > 0
      ? "spot_check"
      : resolveLane(asked);
  const autoSwitched = asked == null && lane === "spot_check";

  const filters = {
    lane,
    view: one(sp.view),
    channel: one(sp.channel),
    type: one(sp.type),
    rule: one(sp.rule),
    outcome: one(sp.outcome),
    office: one(sp.office),
    status: one(sp.status),
    date: one(sp.date),
    page,
  };

  const [queue, reasons, calibration] = await Promise.all([
    getQueue(filters),
    reasonsPromise,
    calibrationPromise,
  ]);

  if (queue.error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">We couldn&apos;t load the review queue.</p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{queue.error}</p>
        </CardContent>
      </Card>
    );
  }

  // Default the selection to the first row so the panel is never empty on a
  // queue that has messages — a reviewer should land ready to score.
  const wanted = Number(one(sp.ctx) ?? 0) || 0;
  const selectedId = queue.rows.some((r) => r.context_id === wanted)
    ? wanted
    : (queue.rows[0]?.context_id ?? 0);

  /*
   * The selected row is already in hand. `selectedId` is derived from
   * queue.rows immediately above — it is either `wanted` (checked present) or
   * rows[0] — and getContext() selects the SAME columns from the SAME view
   * that getQueue() just read. Fetching it again was a guaranteed-redundant
   * round trip on every render and, worse, on every message click.
   *
   * The getContext() fallback is unreachable today; it stays so that a future
   * change to how selectedId is chosen degrades to a fetch rather than to a
   * blank panel.
   */
  const selected =
    queue.rows.find((r) => r.context_id === selectedId) ??
    (selectedId ? await getContext(selectedId) : null);

  // The whole conversation, not just the clicked message. A contact with no
  // GHL id cannot be shown to have other messages, so it stands alone.
  const conversation = selected?.ghl_contact_id
    ? await getConversation(selected.ghl_contact_id)
    : selected
      ? [selected]
      : [];

  const [snapshots, mine] = await Promise.all([
    getThreads(conversation.map((r) => r.context_id)),
    getMyFeedback(ctx.email, [...queue.rows, ...conversation].map((r) => ({ type: r.message_type, ref: r.message_ref }))),
  ]);

  const timeline = buildTimeline(conversation, snapshots);

  // Keyed by context id for the thread, which knows a bubble by the message it
  // renders, not by the (type, ref) pair the feedback table is keyed on.
  const feedbackByContext: Record<number, MyFeedback> = {};
  for (const r of conversation) {
    const f = mine.get(`${r.message_type}::${r.message_ref}`);
    if (f) feedbackByContext[r.context_id] = f;
  }
  const myFeedback = selected ? (feedbackByContext[selected.context_id] ?? null) : null;

  // Filter dropdown options come from what is actually in the queue, so a rule
  // with no messages never appears as a choice that returns nothing.
  const rules = [...new Set(queue.rows.map((r) => r.rule_applied ?? r.workflow_code).filter(Boolean))] as string[];
  const offices = [...new Set(queue.rows.map((r) => r.office).filter(Boolean))] as string[];

  const showCalibration = calibration != null && !calibration.calibrated && ctx.role === "team";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showCalibration && (
        <CalibrationBanner
          done={calibration.calibration_done}
          target={calibration.calibration_target}
          agreement={calibration.agreement}
          agreementTarget={calibration.agreement_target}
        />
      )}
      <FilterBar rules={rules.sort()} offices={offices.sort()} laneCounts={laneCounts} />
      {autoSwitched && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Nothing needs you right now. Every message is still being scored automatically — this is a sample to
          spot check.
        </p>
      )}
      <ReviewWorkspace
        rows={queue.rows}
        total={queue.total}
        page={page}
        selected={selected}
        conversation={conversation}
        timeline={timeline}
        feedbackByContext={feedbackByContext}
        myFeedback={myFeedback}
        reasons={reasons}
        canStopBot={canStopBot(ctx)}
        // The panel hides Remove review for anyone who could not use it. LP MCP
        // re-checks the actual row's author either way.
        canRemoveReview={canReview(ctx)}
      />
    </div>
  );
}

/**
 * Completed — the record of what has been reviewed, set aside, or removed.
 *
 * Team members are PINNED to their own email here (`forceReviewer`). It is not
 * a default they can change: Completed is a record of your own work, and a team
 * member browsing everyone else's verdicts before they are calibrated is how
 * calibration stops measuring anything.
 */
async function CompletedTab({
  ctx,
  sp,
  page,
}: {
  ctx: Awaited<ReturnType<typeof getAccessContext>> & object;
  sp: Search;
  page: number;
}) {
  const wide = canSeeOtherReviewers(ctx);
  const show = one(sp.show) ?? "reviews";

  const filters = {
    reviewer: one(sp.reviewer),
    verdict: one(sp.verdict),
    lane: one(sp.lane),
    date: one(sp.date),
    show,
    page,
  };

  const [completed, summary, dismissals] = await Promise.all([
    getCompleted(filters, wide ? null : ctx.email),
    getCompletedSummary(ctx.email),
    show === "dismissed" ? getDismissals(page) : Promise.resolve({ rows: [], total: 0, needsMigration: false }),
  ]);

  if (completed.needsMigration) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">Not migrated yet.</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Apply <span className="font-mono text-xs">sql/106_bot_review_inc2.sql</span> in the LP Supabase SQL
            editor to see Completed. The Review tab keeps working without it.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (completed.error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">We couldn&apos;t load Completed.</p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{completed.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <CompletedTable
      rows={completed.rows}
      total={completed.total}
      page={page}
      summary={summary}
      dismissals={dismissals.rows}
      reviewers={completed.reviewers}
      myEmail={ctx.email}
      isAdmin={ctx.isAdmin === true}
      canPickReviewer={wide}
      canUndoDismiss={canUndoDismiss(ctx)}
      canSeeRetracted={canSeeRetracted(ctx)}
    />
  );
}

async function ScoreboardTab() {
  const [board, lanes] = await Promise.all([getScoreboard(), getLaneScoreboard()]);
  if (board.needsMigration) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Apply <span className="font-mono text-xs">sql/104_bot_review_views.sql</span> to see the Scoreboard.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (board.error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">We couldn&apos;t load the Scoreboard.</p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{board.error}</p>
        </CardContent>
      </Card>
    );
  }
  return <Scoreboard weeks={board.weeks} issues={board.issues} lanes={lanes} />;
}

/**
 * What the bot has learned — the live prompt editor.
 *
 * These are the instructions the nurture generator actually runs. LP MCP reads
 * them fresh on every message, so an activation here is in front of a customer
 * on the next send — which is why the editor stages drafts and the list is read
 * through LP MCP rather than straight from Supabase.
 */
async function PromptsTab({
  ctx,
  sp,
}: {
  ctx: Awaited<ReturnType<typeof getAccessContext>> & object;
  sp: Search;
}) {
  const list = await getPromptList(ctx.email);

  if (!list.ok) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">
            We couldn&apos;t load the prompts.
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{list.error}</p>
        </CardContent>
      </Card>
    );
  }

  const prompts = list.data.prompts;
  // Default to the first prompt so the tab opens on something to read rather
  // than an empty panel — the same choice the Review queue makes.
  const wanted = one(sp.prompt);
  const selectedId = prompts.some((p) => p.id === wanted) ? wanted : (prompts[0]?.id ?? null);
  const detail = selectedId ? await getPromptDetail(ctx.email, selectedId) : null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="min-h-0 lg:h-[calc(100vh-16rem)]">
        <PromptList prompts={prompts} selectedId={selectedId} />
      </div>
      <div className="min-h-0">
        {detail?.ok ? (
          <PromptEditor key={selectedId} detail={detail.data} />
        ) : detail ? (
          <Card>
            <CardContent>
              <p className="text-sm font-semibold text-navy-900 dark:text-white">
                We couldn&apos;t open that prompt.
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                {detail.error}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Pick a prompt on the left to read or edit it.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const PHASE_NOTE: Record<string, { title: string; body: string }> = {
  compare: {
    title: "Compare arrives with Phase 3.",
    body: "Blind A-vs-B picks while a fix runs its three-day shadow test. There is nothing to compare until fixes exist.",
  },
  fixes: {
    title: "Fixes arrives with Phase 2.",
    body: "Patterns grouped from your reviews, and each proposed fix from drafted through verified. Phase 1 is collecting the reviews those patterns are built from.",
  },
};

function ComingIn({ tab }: { tab: string }) {
  // A tab with no note would be a routing bug, not a blank card — say so.
  const note = PHASE_NOTE[tab] ?? {
    title: "Not built yet.",
    body: "This tab has no Phase 1 content.",
  };
  return (
    <Card>
      <CardContent>
        <p className="text-sm font-semibold text-navy-900 dark:text-white">{note.title}</p>
        <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-300">{note.body}</p>
      </CardContent>
    </Card>
  );
}
