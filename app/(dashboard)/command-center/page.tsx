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
import { LaneCard } from "@/components/command-center/LaneCard";
import { BatchGroup } from "@/components/command-center/BatchGroup";
import { DecidedList } from "@/components/command-center/DecidedList";
import { ChangeCard } from "@/components/command-center/ChangeCard";
import { CHANGE_FILTERS } from "@/components/command-center/changeMeta";
import { getQueue, getHeader, getDecided, getAgreement, getBatchGroups } from "@/lib/queries/commandCenter";
import type { Lane } from "@/lib/commandCenter/rules";
import type { BatchGroup as Group } from "@/lib/commandCenter/batch";
import { getChanges } from "@/lib/queries/changes";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const TABS = [
  { key: "rulings", label: "Rulings" },
  { key: "decided", label: "Decided" },
  { key: "stale", label: "Stale issues" },
  { key: "todos", label: "To-dos" },
  { key: "changes", label: "Changes" },
] as const;

/** Which queue lane a tab reads. Decided and Changes read neither. */
const TAB_LANE: Partial<Record<(typeof TABS)[number]["key"], Lane>> = {
  rulings: "rulings",
  stale: "stale",
  todos: "todos",
};

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
 * Release 2 (sql/112) builds the two lanes Release 1 could only count. All
 * three are live now: rule a decision, say whether a stale issue is still
 * broken, or clear a to-do — one at a time, or fifty in a reversible pass.
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

  const [header, agreement, queue, decided, changes, groups] = await Promise.all([
    getHeader(),
    getAgreement(),
    TAB_LANE[tab]
      ? getQueue({
          lane: TAB_LANE[tab],
          area: one(sp.area),
          type: one(sp.type),
          omiOnly: one(sp.omi) === "1",
          highConfidenceOnly: one(sp.high) === "1",
          page,
        })
      : Promise.resolve(null),
    tab === "decided" ? getDecided({ page }) : Promise.resolve(null),
    tab === "changes"
      ? getChanges({ status: one(sp.status) ?? "open", lane: one(sp.lane), page })
      : Promise.resolve(null),
    // Groups are read alongside the page rather than from it: a group is a
    // group whether or not its members happen to land on the page you are on.
    tab === "stale" || tab === "todos"
      ? getBatchGroups(TAB_LANE[tab]!)
      : Promise.resolve(null),
  ]);

  // PR B can merge before sql/102 is applied. Say which step is missing rather
  // than rendering an empty page that looks like there is nothing to rule.
  const needsMigration =
    header.needsMigration || agreement.needsMigration || queue?.needsMigration || decided?.needsMigration;
  // The Changes lane has its own migration (0020) and its own answer, so a
  // missing table there must not blank the lanes that ARE applied.
  const changesNeedMigration = changes?.needsMigration ?? false;

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
            <HeaderStats stats={header} agreement={agreement} />

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

            {(tab === "stale" || tab === "todos") && queue ? (
              <LaneTab queue={queue} groups={groups?.groups ?? []} canRule={canRule} />
            ) : null}

            {tab === "decided" && decided ? (
              <section className="space-y-4">
                {decided.error ? <ErrBanner msg={decided.error} /> : null}
                <DecidedList rows={decided.rows} canRule={canRule} />
                <Pager page={decided.page} total={decided.total} pageSize={decided.pageSize} tab="decided" />
              </section>
            ) : null}

            {tab === "changes" && changes ? (
              <ChangesTab result={changes} canEdit={canRule} needsMigration={changesNeedMigration} />
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

      <Pager
        page={queue.page} total={queue.total} pageSize={queue.pageSize}
        tab="rulings" keep={queue.filters}
      />
    </section>
  );
}

/**
 * The Changes lane — what was approved, and how far it has got.
 *
 * This is the To-dos tab finally built. It was counted but never rendered, which
 * is the same shape as the bug underneath it: build_needed items have been
 * written since March and read by nothing.
 */
function ChangesTab({
  result, canEdit, needsMigration,
}: {
  result: NonNullable<Awaited<ReturnType<typeof getChanges>>>;
  canEdit: boolean;
  needsMigration: boolean;
}) {
  if (needsMigration) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
            The Changes lane needs migration 0020
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Apply
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">db/migrations/0020_command_center_changes.sql</code>
            in the LP Supabase SQL editor and reload. It creates the table and backfills
            the build items that have been filed but never shown.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <nav className="flex flex-wrap gap-1.5">
        {CHANGE_FILTERS.map((f) => {
          const n = result.counts[f.key || "all"] ?? (f.key ? result.counts[f.key] : undefined);
          const href = (f.key ? `/command-center?tab=changes&status=${f.key}` : "/command-center?tab=changes&status=") as Route;
          return (
            <Link
              key={f.key || "all"}
              href={href}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {f.label}
              {typeof n === "number" ? <span className="ml-1 text-slate-400">{n}</span> : null}
            </Link>
          );
        })}
      </nav>

      {result.error ? <ErrBanner msg={result.error} /> : null}

      {result.rows.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Nothing here. Either this filter is empty, or every change has been dealt with.
        </p>
      ) : (
        <div className="space-y-3">
          {result.rows.map((c) => (
            <ChangeCard key={c.id} change={c} canEdit={canEdit} />
          ))}
        </div>
      )}

      <Pager page={result.page} total={result.total} pageSize={result.pageSize} tab="changes" />
    </section>
  );
}

/**
 * A Release 2 lane: Stale issues or To-dos.
 *
 * The passes come FIRST and the cards come after. That order is the point of
 * the release — 624 stale issues and 2,400 to-dos cannot be cleared one click
 * at a time, so the screen leads with the groups that can be cleared together
 * and keeps the one-at-a-time list underneath for everything that cannot.
 *
 * A card can appear in both, and that is fine: the group is a shortcut, not a
 * separate queue. Rule it either way and it is gone from both on the next load.
 */
function LaneTab({
  queue, groups, canRule,
}: {
  queue: NonNullable<Awaited<ReturnType<typeof getQueue>>>;
  groups: Group[];
  canRule: boolean;
}) {
  const lane = queue.lane;
  return (
    <section className="space-y-4">
      <Filters areas={queue.areas} />
      {queue.error ? <ErrBanner msg={queue.error} /> : null}

      {groups.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
              Ready to clear together
            </h2>
            <InfoPopover helpKey="commandCenter.batchPass" />
          </div>
          {groups.map((g) => (
            <BatchGroup key={g.key} group={g} canRule={canRule} />
          ))}
        </div>
      ) : null}

      {queue.cards.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          {lane === "stale"
            ? "No stale issues. Either everything open has been verified recently, or the filters are hiding it."
            : "No open to-dos here. Either they are all done, or the filters are hiding them."}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.length > 0 ? (
            <h2 className="pt-2 text-sm font-semibold text-navy-900 dark:text-slate-100">
              One at a time
            </h2>
          ) : null}
          {queue.cards.map((c) => (
            <LaneCard key={`${c.source_table}:${c.source_id}`} card={c} canRule={canRule} />
          ))}
        </div>
      )}

      <Pager
        page={queue.page} total={queue.total} pageSize={queue.pageSize}
        tab={lane === "stale" ? "stale" : "todos"} keep={queue.filters}
      />
    </section>
  );
}


function Pager({
  page, total, pageSize, tab, keep,
}: {
  page: number; total: number; pageSize: number; tab: string;
  /** The filters currently applied, so paging does not silently drop them. */
  keep?: Record<string, string | null>;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  // typedRoutes is on, and a query string built at runtime is not a known
  // route literal — the cast is the documented escape hatch for exactly this.
  const href = (p: number) => {
    // Paging used to rebuild the query string from scratch, which dropped every
    // filter the moment someone hit Next — on a 2,400-card lane that reads as
    // the filter having failed rather than as the pager having forgotten.
    const q = new URLSearchParams({ tab, page: String(p) });
    for (const [k, v] of Object.entries(keep ?? {})) if (v) q.set(k, v);
    return `/command-center?${q.toString()}` as Route;
  };
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
