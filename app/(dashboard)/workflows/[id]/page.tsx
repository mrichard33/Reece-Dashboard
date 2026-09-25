import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { ScheduleList } from "@/components/workflows/ScheduleList";
import { LogicTree } from "@/components/workflows/LogicTree";
import { ActiveLeadsTable } from "@/components/workflows/ActiveLeadsTable";
import { Flowchart } from "@/components/workflows/Flowchart";
import { StrategyCard, VERDICT_TONE } from "@/components/workflows/StrategyCard";
import { StrategyTab } from "@/components/workflows/StrategyTab";
import { insightFor, VERDICT_LABEL } from "@/lib/workflows/insights";
import { getWorkflowDetail, type WorkflowDetail, type WorkflowLink } from "@/lib/queries/workflowDetail";
import { cn, num, relTime } from "@/lib/utils";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

// Flowchart first (2026-09-25): the team asked to see every path without
// reading a step list. Triggers moved into the "in and out" header.
const TABS = [
  { key: "flow", label: "Flowchart" },
  { key: "strategy", label: "Strategy" },
  { key: "schedule", label: "Every message" },
  { key: "logic", label: "Step list" },
  { key: "leads", label: "Leads in it now" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * One workflow: how contacts get in and out, every path as a flowchart, every
 * message it can send, and who is in it now. Read-only — edits stay in GHL.
 */
export default async function WorkflowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("operator");
  const { id } = await params;
  const sp = await searchParams;
  const tabRaw = one(sp.tab);
  const tab: TabKey = TABS.some((t) => t.key === tabRaw) ? (tabRaw as TabKey) : "flow";

  let detail;
  try {
    detail = await getWorkflowDetail(id);
  } catch (e) {
    console.error("[workflows/[id]]", id, e);
    return (
      <>
        <TopBar email={user.email} role={user.role} title="Workflow" />
        <p className="p-6 text-sm text-rose-600 dark:text-rose-400">Could not read this workflow from the GHL cache. Try again in a minute.</p>
      </>
    );
  }
  if (!detail) notFound();
  const insight = insightFor(id);

  const reg = detail.registry;
  const title = reg?.canonical_name ?? detail.name;
  const meta: [string, string | null][] = [
    ["Psychological stage", reg?.psychological_stage ?? null],
    ["Trust state", reg?.trust_state ?? null],
    ["Pressure", reg?.message_pressure_level ?? null],
    ["Cadence", reg?.cadence_profile ?? null],
    ["Role", reg?.workflow_role ?? null],
  ];

  return (
    <>
      <TopBar email={user.email} role={user.role} title={title} subtitle="Workflow detail" />

      <div className="space-y-6 p-4 sm:p-6">
        <Link href="/workflows" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          <ArrowLeft className="h-4 w-4" /> Back to Workflows
        </Link>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-navy-900 dark:text-white">{title}</h1>
            {reg?.stage_family && <Badge tone="navy">{reg.stage_family}</Badge>}
            {detail.status === "published" ? (
              <Badge tone="emerald" dot>
                Published
              </Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )}
            {detail.version !== null && <span className="text-xs text-slate-500">v{detail.version}</span>}
          </div>
          {reg?.canonical_name && reg.canonical_name !== detail.name && <p className="text-xs text-slate-500">GHL name: {detail.name}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {meta
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k}>
                  <span className="text-slate-400">{k}:</span> {v}
                </span>
              ))}
            <span>
              <span className="text-slate-400">Tag codes:</span> {detail.codes.length ? detail.codes.map((c) => `active-${c.toLowerCase()}`).join(", ") : "not registered"}
            </span>
          </div>
          {reg?.notes && <p className="text-xs italic text-slate-500">{reg.notes}</p>}
        </div>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Active leads" value={detail.activeCount === null ? "—" : num(detail.activeCount)} helpKey="workflows.activeLeads" />
          <StatTile
            label="Sent (30 d)"
            value={detail.sending?.sends30d === null || detail.sending?.sends30d === undefined ? "—" : num(detail.sending.sends30d)}
            suffix={detail.sending ? ` · ${num(detail.sending.entries30d)} in` : undefined}
            helpKey="workflows.sending"
          />
          <StatTile label="Steps" value={num(detail.stepCount)} helpKey="workflows.total" />
          <StatTile label="Last changed" value={relTime(detail.updatedAt)} helpKey="workflows.total" />
        </section>

        {detail.sending?.verdict === "turned_off" && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-900">
            <strong>Messages turned off in GHL:</strong> every SMS and email step in this workflow is switched off, so leads move through it without receiving anything
            ({num(detail.sending.entries30d)} entered in the last {detail.sending.days} days). Any &ldquo;sent:&rdquo; tags it adds are not real sends.
          </p>
        )}
        {detail.sending && detail.sending.verdict !== "turned_off" && detail.sending.offSteps > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
            <strong>{detail.sending.offSteps} message{detail.sending.offSteps === 1 ? " is" : "s are"} turned off in GHL.</strong> Those steps are marked on the flowchart; send counts come from matching the text of messages that actually went out.
          </p>
        )}
        {detail.sending?.verdict === "no_sends_seen" && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-900">
            <strong>No sends seen:</strong> {num(detail.sending.entries30d)} leads entered in the last {detail.sending.days} days and none of this workflow&apos;s messages went out.
            The flowchart marks each step as &ldquo;no one reached this step&rdquo; or &ldquo;reached, no sends seen&rdquo; — the second is the place to look.
          </p>
        )}
        {detail.sending?.verdict === "too_few_to_judge" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
            <strong>Nothing sent, but too few leads to judge:</strong> {detail.sending.note}.
          </p>
        )}
        {detail.sending?.verdict === "unknown" && detail.sending.note && detail.sending.entries30d > 0 && (
          <p className="text-xs text-slate-500">Sends could not be judged: {detail.sending.note}.</p>
        )}
        {detail.sending?.outcomes && (
          <section className="grid grid-cols-3 gap-4">
            <StatTile label="Replied" value={pct(detail.sending.outcomes.replyRate)} suffix={` · ${num(detail.sending.outcomes.replied)} of ${num(detail.sending.outcomes.entries)}`} helpKey="workflows.outcomes" />
            <StatTile label="Booked" value={pct(detail.sending.outcomes.bookingRate)} suffix={` · ${num(detail.sending.outcomes.booked)}`} helpKey="workflows.outcomes" />
            <StatTile label="Opted out" value={pct(detail.sending.outcomes.optOutRate)} suffix={` · ${num(detail.sending.outcomes.optedOut)}`} helpKey="workflows.outcomes" />
          </section>
        )}
        {detail.sendActivityError && <p className="text-xs text-slate-400">Send counts unavailable: {detail.sendActivityError}</p>}

        {insight && <StrategyCard insight={insight} currentVersion={detail.version} ghlWorkflowId={id} />}

        <InOut detail={detail} />

        <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={(t.key === "flow" ? `/workflows/${id}` : `/workflows/${id}?tab=${t.key}`) as Route}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                tab === t.key
                  ? "border-navy-700 font-medium text-navy-900 dark:border-sky-400 dark:text-white"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <Card>
          <CardHeader>
            <CardTitle>{TABS.find((t) => t.key === tab)?.label}</CardTitle>
            <InfoPopover
              helpKey={
                tab === "flow" ? "workflows.flowchart" : tab === "strategy" ? "workflows.strategy" : tab === "leads" ? "workflows.activeTab" : tab === "schedule" ? "workflows.schedule" : "workflows.total"
              }
            />
          </CardHeader>
          <CardContent>
            {tab === "strategy" &&
              (insight ? (
                <StrategyTab insight={insight} schedule={detail.schedule} sends={detail.stepSends} />
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">This workflow has not been reviewed yet{detail.schedule.length === 0 ? " — it sends no messages" : ""}.</p>
              ))}
            {tab === "schedule" && <ScheduleList rows={detail.schedule} sends={detail.stepSends} />}
            {tab === "logic" && <LogicTree lines={detail.logic} />}
            {tab === "leads" && <ActiveLeadsTable ghlWorkflowId={id} />}
            {tab === "flow" && (
              <Flowchart
                flow={detail.flow}
                draft={detail.status !== "published"}
                annotations={Object.fromEntries(
                  Object.entries(detail.stepSends).map(([stepId, s]) => {
                    const m = insight?.messages.find((x) => x.stepId === stepId);
                    return [stepId, { sends: s, badge: m && m.verdict !== "ok" ? { label: VERDICT_LABEL[m.verdict], tone: VERDICT_TONE[m.verdict] } : undefined }];
                  }),
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function LinkChips({ label, links }: { label: string; links: WorkflowLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
      <span className="text-slate-400">{label}:</span>
      {links.map((l) => (
        <Link key={l.ghlWorkflowId} href={`/workflows/${l.ghlWorkflowId}` as Route}>
          <Badge tone="sky">{l.name}</Badge>
        </Link>
      ))}
    </div>
  );
}

type Trigger = WorkflowDetail["triggers"][number];

/** Entry and exit in one box, so nobody has to open GHL to learn how a lead lands here. */
function InOut({ detail }: { detail: WorkflowDetail }) {
  const ends = detail.flow.nodes.filter((n) => n.kind === "end").length;
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
        <h2 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          How contacts get in
          <InfoPopover helpKey="workflows.flowchart" align="left" />
        </h2>
        {detail.triggers.length === 0 && detail.addedBy.length === 0 && detail.receivesFrom.length === 0 && (
          <p className="text-slate-500">No trigger cached — contacts are added by the API or an LP rule.</p>
        )}
        <ul className="space-y-1">
          {detail.triggers.map((t, i) => (
            <TriggerLine key={i} t={t} />
          ))}
        </ul>
        <LinkChips label="Added by" links={detail.addedBy} />
        <LinkChips label="Receives from" links={detail.receivesFrom.filter((l) => !detail.addedBy.some((a) => a.ghlWorkflowId === l.ghlWorkflowId))} />
      </div>
      <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">How contacts leave</h2>
        <ul className="space-y-1 text-navy-900 dark:text-slate-100">
          <li>
            Reaching the end of a path{ends > 1 ? ` (${ends} end points)` : ""}.
          </li>
          {detail.removeSteps > 0 && (
            <li>
              {detail.removeSteps} &quot;Remove from workflow&quot; step{detail.removeSteps === 1 ? "" : "s"} inside the flow.
            </li>
          )}
          <li className="text-slate-500">Any &quot;stop&quot; / do-not-contact reply stops it for that lead.</li>
        </ul>
        {detail.exitWorkflow && <LinkChips label="Exit workflow" links={[detail.exitWorkflow]} />}
        <LinkChips label="Sends on to" links={detail.routesTo} />
      </div>
    </section>
  );
}

function TriggerLine({ t }: { t: Trigger }) {
  const off = t.active === false;
  return (
    <li className={cn("text-navy-900 dark:text-slate-100", off && "text-slate-400 line-through dark:text-slate-500")}>
      {t.name ?? "Unnamed trigger"}
      {t.event && <span className="text-slate-500"> — {t.event.replace(/_/g, " ")}</span>}
      {off && <span className="ml-1 text-[11px] no-underline"> (turned off)</span>}
    </li>
  );
}
