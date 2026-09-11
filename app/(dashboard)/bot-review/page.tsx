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
import { CalibrationBanner } from "@/components/bot-review/Overlays";
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
  type MyFeedback,
} from "@/lib/queries/botReview";
import { resolveTab, visibleTabs, canStopBot, buildTimeline, TABS, type TabKey } from "@/lib/botReview/core";

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
 * Phase 1 ships Review and the basic Scoreboard. Compare, Fixes and
 * "What the bot has learned" are Phase 2–3: they render a short note saying
 * which phase builds them, rather than an empty tab that reads as broken —
 * the same choice the Command Center made for its Stale-issue lane.
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

        {tab === "review" && <ReviewTab ctx={ctx} sp={sp} page={page} />}
        {tab === "scoreboard" && <ScoreboardTab />}
        {(tab === "compare" || tab === "fixes" || tab === "learned") && <ComingIn tab={tab} />}
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
  const filters = {
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
    getReasons(),
    getCalibration(ctx.email),
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

  const selected = selectedId ? await getContext(selectedId) : null;

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
      <FilterBar rules={rules.sort()} offices={offices.sort()} />
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
      />
    </div>
  );
}

async function ScoreboardTab() {
  const board = await getScoreboard();
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
  return <Scoreboard weeks={board.weeks} issues={board.issues} />;
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
  learned: {
    title: "What the bot has learned arrives with Phase 2.",
    body: "Every approved instruction and example currently shaping bot messages. Nothing reaches the bot yet — Phase 1 is review only.",
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
