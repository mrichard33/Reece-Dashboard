import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { HeaderStats } from "@/components/command-center/HeaderStats";
import { Filters } from "@/components/command-center/Filters";
import { RulingCard } from "@/components/command-center/RulingCard";
import { DecidedList } from "@/components/command-center/DecidedList";
import { getQueue, getHeader, getDecided } from "@/lib/queries/commandCenter";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const TABS = [
  { key: "rulings", label: "Rulings" },
  { key: "decided", label: "Decided" },
  { key: "stale", label: "Stale issues" },
  { key: "todos", label: "To-dos" },
] as const;

/**
 * The Command Center — Release 1, Rulings lane.
 *
 * Access, in three lines at the top, because this page writes to memory:
 *   role "team"       → sent to /overview; they never see it.
 *   operator          → sees everything, rules nothing (no buttons render).
 *   operator + admin  → can rule, set stages, and flip.
 * The server action re-checks all of this. Hiding buttons is the courtesy; the
 * action is the gate.
 *
 * Release 1 ships the header and the Rulings lane. The Stale-issue and To-do
 * lanes are counted, not built — shown as tiles that say so, rather than as
 * empty tabs that look broken.
 */
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "operator") redirect("/overview");

  const sp = await searchParams;
  const tab = (one(sp.tab) ?? "rulings") as (typeof TABS)[number]["key"];
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const canRule = ctx.isAdmin;

  const [header, queue, decided] = await Promise.all([
    getHeader(),
    tab === "rulings"
      ? getQueue({
          area: one(sp.area),
          type: one(sp.type),
          omiOnly: one(sp.omi) === "1",
          highConfidenceOnly: one(sp.high) === "1",
          page,
        })
      : Promise.resolve(null),
    tab === "decided" ? getDecided({ page }) : Promise.resolve(null),
  ]);

  // PR B can merge before sql/102 is applied. Say which step is missing rather
  // than rendering an empty page that looks like there is nothing to rule.
  const needsMigration = header.needsMigration || queue?.needsMigration || decided?.needsMigration;

  return (
    <>
      <TopBar email={ctx.email} role={ctx.role} title="Command Center" />

      <div className="space-y-6 p-6">
        <SectionHeader
          title="Command Center"
          subtitle="Rule, review, roll back."
        />

        {needsMigration ? (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
                Command Center needs sql/102
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                The rulings queue and its audit log are not in the database yet. Apply
                <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">sql/102_command_center.sql</code>
                in the LP Supabase SQL editor — sections A through F, in order — and reload.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <HeaderStats stats={header} />

            <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={(t.key === "rulings" ? "/command-center" : `/command-center?tab=${t.key}`) as Route}
                  className={
                    tab === t.key
                      ? "border-b-2 border-navy-700 px-3 py-2 text-sm font-medium text-navy-900 dark:border-slate-200 dark:text-slate-100"
                      : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }
                >
                  {t.label}
                </Link>
              ))}
            </nav>

            {!canRule ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                You can read everything here. Ruling, stages and flips are admin only.
              </p>
            ) : null}

            {tab === "rulings" && queue ? (
              <RulingsTab queue={queue} canRule={canRule} />
            ) : null}

            {tab === "decided" && decided ? (
              <section className="space-y-4">
                {decided.error ? <ErrBanner msg={decided.error} /> : null}
                <DecidedList rows={decided.rows} canRule={canRule} />
                <Pager page={decided.page} total={decided.total} pageSize={decided.pageSize} tab="decided" />
              </section>
            ) : null}

            {tab === "stale" ? (
              <ComingSoon
                helpKey="commandCenter.staleLane"
                title="Stale issues"
                count={header.staleIssuesOpen}
                blurb="Open issues nobody has verified in a long time. Counting them now; ruling on them comes in Release 2."
              />
            ) : null}

            {tab === "todos" ? (
              <ComingSoon
                helpKey="commandCenter.todoLane"
                title="To-dos"
                count={header.todosOpen}
                blurb="Open work items that are not rulings — builds, actions, verifications. Counting them now; working them comes in Release 2."
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function RulingsTab({
  queue, canRule,
}: {
  queue: NonNullable<Awaited<ReturnType<typeof getQueue>>>;
  canRule: boolean;
}) {
  return (
    <section className="space-y-4">
      <Filters areas={queue.areas} />
      {queue.error ? <ErrBanner msg={queue.error} /> : null}

      {queue.cards.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Nothing waiting on you here. Either the queue is clear, or the filters are hiding it.
        </p>
      ) : (
        <div className="space-y-3">
          {queue.cards.map((c) => (
            <RulingCard key={`${c.source_table}:${c.source_id}`} card={c} canRule={canRule} />
          ))}
        </div>
      )}

      <Pager page={queue.page} total={queue.total} pageSize={queue.pageSize} tab="rulings" />
    </section>
  );
}

function ComingSoon({
  helpKey, title, count, blurb,
}: { helpKey: string; title: string; count: number; blurb: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-100">{title}</h2>
          <InfoPopover helpKey={helpKey} />
        </div>
        <div className="mt-2 text-3xl font-semibold text-navy-900 dark:text-slate-100">{count}</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{blurb}</p>
      </CardContent>
    </Card>
  );
}

function Pager({
  page, total, pageSize, tab,
}: { page: number; total: number; pageSize: number; tab: string }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  // typedRoutes is on, and a query string built at runtime is not a known
  // route literal — the cast is the documented escape hatch for exactly this.
  const href = (p: number) =>
    `/command-center?${new URLSearchParams({ tab, page: String(p) }).toString()}` as Route;
  return (
    <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
      <span>Page {page} of {last} · {total.toLocaleString()} total</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="underline" href={href(page - 1)}>Previous</Link> : null}
        {page < last ? <Link className="underline" href={href(page + 1)}>Next</Link> : null}
      </div>
    </div>
  );
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      Could not load this: {msg}
    </p>
  );
}
