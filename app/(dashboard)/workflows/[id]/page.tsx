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
import { getWorkflowDetail, type WorkflowLink } from "@/lib/queries/workflowDetail";
import { cn, num, relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const TABS = [
  { key: "schedule", label: "Messages & timing" },
  { key: "logic", label: "Logic" },
  { key: "leads", label: "Leads in this workflow" },
  { key: "triggers", label: "Triggers" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * One workflow: what it sends and when, how it decides, who is in it now,
 * and what starts it. Read-only — GHL workflow edits stay in GHL.
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
  const tab: TabKey = TABS.some((t) => t.key === tabRaw) ? (tabRaw as TabKey) : "schedule";

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
            <Badge tone={detail.status === "published" ? "emerald" : "slate"} dot>
              {detail.status ?? "unknown"}
            </Badge>
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
          <LinkChips label="Receives from" links={detail.receivesFrom} />
          <LinkChips label="Routes to" links={detail.routesTo} />
          {reg?.notes && <p className="text-xs italic text-slate-500">{reg.notes}</p>}
        </div>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Active leads" value={detail.activeCount === null ? "—" : num(detail.activeCount)} helpKey="workflows.activeLeads" />
          <StatTile label="Sends" value={num(detail.schedule.length)} helpKey="workflows.schedule" />
          <StatTile label="Steps" value={num(detail.stepCount)} helpKey="workflows.total" />
          <StatTile label="Last changed" value={relTime(detail.updatedAt)} helpKey="workflows.total" />
        </section>

        <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={(t.key === "schedule" ? `/workflows/${id}` : `/workflows/${id}?tab=${t.key}`) as Route}
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
            <InfoPopover helpKey={tab === "leads" ? "workflows.activeTab" : tab === "schedule" ? "workflows.schedule" : "workflows.total"} />
          </CardHeader>
          <CardContent>
            {tab === "schedule" && <ScheduleList rows={detail.schedule} />}
            {tab === "logic" && <LogicTree lines={detail.logic} />}
            {tab === "leads" && <ActiveLeadsTable ghlWorkflowId={id} />}
            {tab === "triggers" && <Triggers triggers={detail.triggers} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function LinkChips({ label, links }: { label: string; links: WorkflowLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-slate-400">{label}:</span>
      {links.map((l) => (
        <Link key={l.ghlWorkflowId} href={`/workflows/${l.ghlWorkflowId}` as Route}>
          <Badge tone="sky">{l.name}</Badge>
        </Link>
      ))}
    </div>
  );
}

function Triggers({ triggers }: { triggers: { name: string | null; event: string | null; value: string | null; active: boolean | null }[] }) {
  if (triggers.length === 0) return <p className="py-6 text-center text-sm text-slate-500">No triggers cached — contacts are added by other workflows or the API.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {triggers.map((t, i) => (
        <li key={i} className="py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-navy-900 dark:text-slate-100">{t.name ?? "Unnamed trigger"}</span>
            {t.event && <Badge tone="navy">{t.event.replace(/_/g, " ")}</Badge>}
            {t.active !== null && (
              <Badge tone={t.active ? "emerald" : "slate"} dot>
                {t.active ? "on" : "off"}
              </Badge>
            )}
          </div>
          {t.value && <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{t.value.length > 300 ? `${t.value.slice(0, 299)}…` : t.value}</p>}
        </li>
      ))}
    </ul>
  );
}
