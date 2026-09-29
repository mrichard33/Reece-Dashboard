import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { StatTile } from "@/components/tiles/StatTile";
import { SpeedTrend } from "@/components/leadLeaks/SpeedTrend";
import { LeadSubLine, WhyCell } from "@/components/leadLeaks/LeadWhy";
import {
  getIntakeSection,
  getLeaksSection,
  getSpeedSection,
  type Section,
} from "@/lib/queries/leadLeaks";
import {
  filterLeaks,
  formatAge,
  formatMinutes,
  LEAK_REASONS,
} from "@/lib/queries/leadLeaks.core";
import { cn, num, shortDate, usd } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Lead Leaks — leads we should be calling and are not.
 *
 * Everything here comes from LP-MCP's Lead Leak Monitor, which runs every
 * morning at 07:00 ET, and uses Five9's call records as the only truth for
 * "was this lead called, and when". LP's own call counts are not used: they
 * showed hundreds of booked leads with zero calls.
 *
 * Its own page, not a tab on Leads or Issues (2026-09-26): Leads is a
 * per-contact list read from the HL cache, Issues is system data problems.
 * This is one operational question — who are we not calling — with a trend.
 */
export default async function LeadLeaksPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; source?: string }>;
}) {
  const user = await requireRole("operator");
  const params = await searchParams;
  const [leaks, speed, intake] = await Promise.all([
    getLeaksSection(),
    getSpeedSection(),
    getIntakeSection(),
  ]);

  const reason = params.reason && (LEAK_REASONS as readonly string[]).includes(params.reason) ? params.reason : null;
  const source = params.source ?? null;
  const runDate = leaks.state === "ok" ? leaks.runDate : null;

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Lead Leaks"
        subtitle="Leads we should be calling and aren't"
      />

      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="Lead Leaks"
          subtitle={
            runDate
              ? `Last checked ${shortDate(runDate)} (every morning at 7:00 AM ET). Five9 call records are the source of truth.`
              : "Checked every morning at 7:00 AM ET. Five9 call records are the source of truth."
          }
        />

        {/* 1. Headline tiles */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="Leads not called"
            value={leaks.state === "ok" ? num(leaks.data.totalLeaks) : "—"}
            deltaTone={leaks.state === "ok" && leaks.data.totalLeaks > 0 ? "rose" : "slate"}
            delta={leaks.state === "ok" ? "should be worked, never dialled" : sectionNote(leaks)}
            helpKey="leadLeaks.notCalled"
          />
          <StatTile
            label="Revenue at risk"
            value={leaks.state === "ok" ? usd(leaks.data.valueAtRisk) : "—"}
            delta="estimate"
            helpKey="leadLeaks.atRisk"
          />
          <StatTile
            label="Time to first call"
            value={speed.state === "ok" ? formatMinutes(speed.data.last7.medianMin) : "—"}
            delta={speed.state === "ok" ? speedDelta(speed.data.deltaMin, speed.data.prior28.medianMin) : sectionNote(speed)}
            deltaTone={speed.state === "ok" ? speedTone(speed.data.deltaMin) : "slate"}
            helpKey="leadLeaks.speed"
          />
          <StatTile
            label="Called within 1 hour"
            value={speed.state === "ok" && speed.data.last7.pctCalled1h !== null
              ? `${Math.round(speed.data.last7.pctCalled1h * 100)}%` : "—"}
            delta="last 7 days, working hours"
            helpKey="leadLeaks.within1h"
          />
          <StatTile
            label="Never reached LP"
            value={intake.state === "ok" ? num(intake.data.missing.length) : "—"}
            deltaTone={intake.state === "ok" && intake.data.missing.length > 0 ? "rose" : "slate"}
            delta={intake.state === "ok" ? "in GHL, never in LP, never called" : sectionNote(intake)}
            helpKey="leadLeaks.neverReachedLp"
          />
        </section>

        {/* 2. Trend */}
        <LeakCard title="Time to first call for the typical lead, by day it arrived" helpKey="leadLeaks.trend">
          <SectionBody section={speed}>
            {(s) => (
              <>
                <SpeedTrend data={s.days.map((d) => ({ day: d.day, medianMin: d.medianMin, p90Min: d.p90Min }))} />
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">
                    Show the numbers by day
                  </summary>
                  <Table head={["Day", "Leads", "Owed a call", "Never called", "Within 1h", "Within 24h", "Typical", "Slowest 10%"]}>
                    {[...s.days].reverse().map((d) => (
                      <tr key={d.day} className={rowClass}>
                        <td className={cellClass}>{shortDate(d.day)}</td>
                        <td className={`${cellClass} tabular`}>{num(d.leads)}</td>
                        <td className={`${cellClass} tabular`}>{num(d.expected)}</td>
                        <td className={`${cellClass} tabular`}>{num(d.neverCalled)}</td>
                        <td className={`${cellClass} tabular`}>{num(d.called1h)}</td>
                        <td className={`${cellClass} tabular`}>{num(d.called24h)}</td>
                        <td className={`${cellClass} tabular`}>{formatMinutes(d.medianMin)}</td>
                        <td className={`${cellClass} tabular`}>{formatMinutes(d.p90Min)}</td>
                      </tr>
                    ))}
                  </Table>
                </details>
              </>
            )}
          </SectionBody>
        </LeakCard>

        {/* 3. Leads we haven't called */}
        <LeakCard
          title="Leads we haven't called"
          helpKey="leadLeaks.table"
          badge={leaks.state === "ok" ? { tone: leaks.data.totalLeaks ? "rose" : "emerald", label: `${num(leaks.data.totalLeaks)} leads` } : null}
        >
          <SectionBody section={leaks}>
            {(l) => {
              const shown = filterLeaks(l.leaks, { reason, source });
              return (
                <>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Chip href={chipHref(null, source)} active={!reason}>All reasons</Chip>
                    {l.byReason.filter((r) => r.leak).map((r) => (
                      <Chip key={r.reason} href={chipHref(r.reason, source)} active={reason === r.reason}>
                        {r.label} · {num(r.count)}
                      </Chip>
                    ))}
                  </div>
                  {l.sources.length > 1 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      <Chip href={chipHref(reason, null)} active={!source}>All sources</Chip>
                      {l.sources.map((src) => (
                        <Chip key={src} href={chipHref(reason, src)} active={source === src}>{src}</Chip>
                      ))}
                    </div>
                  )}
                  {shown.length === 0 ? (
                    <Empty>{l.totalLeaks === 0 ? "Every lead that should have been called was called." : "No leads match these filters."}</Empty>
                  ) : (
                    <Table head={["Lead", { label: "Phone", hide: true }, { label: "Source", hide: true }, "Waiting", "Why it isn't being called", { label: "Est. value", hide: true }, { label: "LP lead", hide: true }]}>
                      {shown.map((x) => (
                        <tr key={x.lpLeadId} className={rowClass}>
                          <td className={`${cellClass} font-medium text-slate-800 dark:text-slate-200`}>
                            {x.name}
                            <LeadSubLine phone={x.phone} source={x.source} lpLeadId={x.lpLeadId} />
                          </td>
                          <td className={`${cellClass} ${hideOnPhone} tabular text-slate-600 dark:text-slate-300`}>{x.phone}</td>
                          <td className={`${cellClass} ${hideOnPhone} text-slate-600 dark:text-slate-300`}>{x.source}</td>
                          <td className={`${cellClass} tabular text-slate-600 dark:text-slate-300`}>{formatAge(x.waitingMs)}</td>
                          <td className={cellClass}><WhyCell tone={reasonTone(x.reason)} label={x.reasonLabel} why={x.why} /></td>
                          <td className={`${cellClass} ${hideOnPhone} tabular text-slate-600 dark:text-slate-300`}>{usd(x.estValue)}</td>
                          <td className={`${cellClass} ${hideOnPhone} break-all font-mono text-slate-500`}>{x.lpLeadId}</td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </>
              );
            }}
          </SectionBody>
        </LeakCard>

        {/* 4. Never reached LP */}
        <LeakCard
          title="Never reached our system"
          helpKey="leadLeaks.intakeTable"
          badge={intake.state === "ok" ? { tone: intake.data.missing.length ? "rose" : "emerald", label: `${num(intake.data.missing.length)} contacts` } : null}
        >
          <SectionBody section={intake}>
            {(g) => (
              <>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  GHL contacts at least a day old with no LP lead, so Five9 could never dial them.
                  Also checked, and not listed: {num(g.calledAnyway)} not in LP but reached by Five9 anyway;
                  {num(g.unlinked)} in LP but not linked to their GHL contact.
                </p>
                {g.missing.length === 0 ? (
                  <Empty>Every GHL lead reached LP or was called.</Empty>
                ) : (
                  <Table head={["Contact", "Phone", "Source", "In GHL since", "GHL contact"]}>
                    {g.missing.map((c) => (
                      <tr key={c.ghlContactId} className={rowClass}>
                        <td className={`${cellClass} font-medium text-slate-800 dark:text-slate-200`}>{c.name}</td>
                        <td className={`${cellClass} tabular text-slate-600 dark:text-slate-300`}>{c.phone}</td>
                        <td className={`${cellClass} text-slate-600 dark:text-slate-300`}>{c.source}</td>
                        <td className={`${cellClass} tabular text-slate-600 dark:text-slate-300`}>{c.dateAdded ? shortDate(c.dateAdded) : "—"}</td>
                        <td className={`${cellClass} font-mono text-slate-500`}>{c.ghlContactId}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </>
            )}
          </SectionBody>
        </LeakCard>

        {/* 5. Not leaks — collapsed, each reason opens to its leads */}
        <LeakCard title="Uncalled, but not leaks" helpKey="leadLeaks.notLeaks">
          <SectionBody section={leaks}>
            {(l) => (
              <>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  {num(l.uncalled - l.totalLeaks)} leads with no Five9 call that were not owed one. Open a reason to see each lead and why.
                </p>
                {l.notLeaks.length === 0 ? (
                  <Empty>None.</Empty>
                ) : (
                  <div className="space-y-2">
                    {l.notLeaks.map((g) => (
                      <details key={g.reason} className="rounded-md border border-slate-100 px-3 py-2 dark:border-slate-800">
                        <summary className="cursor-pointer text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                          {g.label} · <span className="tabular">{num(g.leads.length)}</span>
                        </summary>
                        <div className="mt-2">
                          <Table head={["Lead", "Why it isn't being called", { label: "Source", hide: true }, { label: "LP lead", hide: true }]}>
                            {g.leads.map((x) => (
                              <tr key={x.lpLeadId} className={rowClass}>
                                <td className={`${cellClass} font-medium text-slate-800 dark:text-slate-200`}>
                                  {x.name}
                                  <LeadSubLine phone={x.phone} source={x.source} lpLeadId={x.lpLeadId} />
                                </td>
                                <td className={cellClass}><WhyCell tone="slate" label={x.reasonLabel} why={x.why} /></td>
                                <td className={`${cellClass} ${hideOnPhone} text-slate-600 dark:text-slate-300`}>{x.source}</td>
                                <td className={`${cellClass} ${hideOnPhone} break-all font-mono text-slate-500`}>{x.lpLeadId}</td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </>
            )}
          </SectionBody>
        </LeakCard>
      </div>
    </>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

const rowClass = "hover:bg-slate-50 dark:hover:bg-slate-800/50";
const cellClass = "py-2 pr-3";
// Low-value columns drop off on phones; LeadSubLine (components/leadLeaks/LeadWhy.tsx)
// repeats them under the name — the components/leads/LeadsTable.tsx pattern.
const hideOnPhone = "hidden md:table-cell";

function chipHref(reason: string | null, source: string | null): Route {
  const q = new URLSearchParams();
  if (reason) q.set("reason", reason);
  if (source) q.set("source", source);
  const s = q.toString();
  return (s ? `/lead-leaks?${s}` : "/lead-leaks") as Route;
}

function reasonTone(reason: string): BadgeTone {
  if (reason === "not_issued_call_center" || reason === "not_covered_by_rep") return "rose";
  if (reason === "rep_hold_expired") return "amber";
  return "brick";
}

function speedDelta(deltaMin: number | null, priorMin: number | null): string {
  if (deltaMin === null || priorMin === null) return "last 7 days, working hours";
  if (Math.abs(deltaMin) < 1) return `same as prior 28 days (${formatMinutes(priorMin)})`;
  return deltaMin > 0
    ? `slower than prior 28 days (${formatMinutes(priorMin)})`
    : `faster than prior 28 days (${formatMinutes(priorMin)})`;
}

function speedTone(deltaMin: number | null): "emerald" | "rose" | "slate" {
  if (deltaMin === null || Math.abs(deltaMin) < 1) return "slate";
  return deltaMin > 0 ? "rose" : "emerald";
}

function sectionNote<T>(s: Section<T>): string {
  if (s.state === "missing") return `needs ${s.migration}`;
  if (s.state === "empty") return "no run yet";
  if (s.state === "error") return "could not load";
  return "";
}

function SectionBody<T>({ section, children }: { section: Section<T>; children: (data: T) => React.ReactNode }) {
  if (section.state === "ok") return <>{children(section.data)}</>;
  if (section.state === "missing") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        Needs migration <span className="font-mono">{section.migration}</span> on LP Supabase. Until it is applied this section cannot show anything — it is not a zero.
      </div>
    );
  }
  if (section.state === "empty") {
    return <Empty>No results yet. The Lead Leak Monitor fills this in every morning at 7:00 AM ET.</Empty>;
  }
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
      Could not load this section: {section.message}
    </div>
  );
}

function LeakCard({
  title,
  helpKey,
  badge,
  children,
}: {
  title: string;
  helpKey: string;
  badge?: { tone: BadgeTone; label: string } | null;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          <InfoPopover helpKey={helpKey} align="left" />
        </div>
        {badge && (
          <div className="shrink-0">
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Chip({ href, active, children }: { href: Route; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset transition-colors",
        active
          ? "bg-navy-900 text-white ring-navy-900 dark:bg-white dark:text-navy-900 dark:ring-white"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
      )}
    >
      {children}
    </Link>
  );
}

type Head = string | { label: string; hide?: boolean };

function Table({ head, children }: { head: Head[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            {head.map((h) => {
              const { label, hide } = typeof h === "string" ? { label: h, hide: false } : h;
              return <th key={label} className={cn("pb-2 pr-3 font-medium", hide && hideOnPhone)}>{label}</th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-500">{children}</p>;
}
