import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DecideTicket, DisputeLineButton, MissingLeadButton } from "@/components/payroll/DisputeForms";
import {
  buildTabs,
  canDisputeLine,
  disputeStatusBadge,
  eventLabel,
  formatCents,
  lineStatusBadge,
  PAYABLE,
  PROGRAM_TABS,
  resolveRun,
  resolveTab,
  weekLabel,
  type Dispute,
  type PayrollLine,
  type TabKey,
  type TabSummary,
} from "@/lib/payroll/core";
import {
  getLines,
  isMissingTable,
  leadInfo,
  listDisputes,
  listRuns,
  type LeadInfo,
  type PayrollScope,
  type RunWithPartner,
} from "@/lib/queries/payroll";

/**
 * The payroll page body, shared by /payroll (Reece staff) and /partner/payroll
 * (the partner's own login). Everything it reads is scoped by `scope`, which
 * the PAGE derives from the signed-in account — see lib/queries/payroll.ts.
 *
 * Tabs are pay programs (ruled 2026-09-27): Canvass confirmations ($15),
 * Aged demos ($250), Direct (1.5%), Adjustments when there are any, and the
 * Disputes ticket list. Shadow weeks are shown to the partner as a preview
 * (ruled 2026-09-27) under a banner that says so.
 */
export async function PayrollView({
  scope,
  basePath,
  searchParams,
  canFile,
  canDecide,
}: {
  scope: PayrollScope;
  basePath: "/payroll" | "/partner/payroll";
  searchParams: Record<string, string | string[] | undefined>;
  /** Partner accounts file tickets. */
  canFile: boolean;
  /** Active lf_report_approvers see Approve / Deny. */
  canDecide: boolean;
}) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

  let runs, disputes: Dispute[];
  try {
    [runs, disputes] = await Promise.all([listRuns(scope), listDisputes(scope)]);
  } catch (e) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">
            {isMissingTable(e) ? "Payroll is not set up yet." : "Payroll could not be loaded."}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {isMissingTable(e)
              ? "The payroll tables are not in the database yet (LP-MCP sql/132 and sql/133)."
              : "Please try again in a minute. If it keeps happening, tell Reece."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const run = resolveRun(runs, one(searchParams.run));
  const lines = run ? await getLines(run.id) : [];
  const tabs = buildTabs(lines, disputes.filter((d) => d.status === "open").length);
  const tab = resolveTab(one(searchParams.tab), tabs);
  const program = PROGRAM_TABS.find((t) => t.key === tab);
  const shownIds = program ? lines.filter((l) => l.event_type === program.eventType).map((l) => l.lp_lead_id) : [];
  const info = await leadInfo([...shownIds, ...disputes.map((d) => d.lp_lead_id)]);

  return (
    <PayrollBody
      staff={scope.kind === "staff"}
      basePath={basePath}
      runs={runs}
      run={run}
      lines={lines}
      disputes={disputes}
      info={Object.fromEntries(info)}
      tab={tab}
      tabs={tabs}
      canFile={canFile}
      canDecide={canDecide}
    />
  );
}

/**
 * Pure render of one payroll week. Split from the loader so it can be rendered
 * with sample data (phone-width check, CLAUDE.md) without a database.
 */
export function PayrollBody({
  staff,
  basePath,
  runs,
  run,
  lines,
  disputes,
  info,
  tab,
  tabs,
  canFile,
  canDecide,
}: {
  staff: boolean;
  basePath: string;
  runs: RunWithPartner[];
  run: RunWithPartner | null;
  lines: PayrollLine[];
  disputes: Dispute[];
  info: Record<string, LeadInfo>;
  tab: TabKey;
  tabs: TabSummary[];
  canFile: boolean;
  canDecide: boolean;
}) {
  const program = PROGRAM_TABS.find((t) => t.key === tab);
  const shown = program ? lines.filter((l) => l.event_type === program.eventType) : [];
  const openByLine = new Set(disputes.filter((d) => d.status === "open").map((d) => d.ledger_id).filter(Boolean));
  const href = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const r = params.run ?? run?.id ?? null;
    if (r) q.set("run", r);
    if (params.tab) q.set("tab", params.tab);
    const s = q.toString();
    return (s ? `${basePath}?${s}` : basePath) as Route;
  };

  const payable = lines.filter((l) => PAYABLE.includes(l.status)).reduce((s, l) => s + l.amount_cents, 0);
  const review = lines.filter((l) => l.status === "needs_review" || l.status === "disputed").length;
  const infoRows = lines.filter((l) => l.status === "info").length;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Payroll"
        subtitle="Every lead that earned pay, by program. Dispute a line or report a missing lead; Reece approves or denies each ticket."
        action={canFile ? <MissingLeadButton /> : undefined}
      />

      {/* Week picker */}
      {runs.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-slate-600 dark:text-slate-300">No payroll weeks yet. The first one appears after the Monday run.</p>
          </CardContent>
        </Card>
      ) : (
        <nav aria-label="Week" className="flex gap-2 overflow-x-auto pb-1">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={href({ run: r.id, tab })}
              className={
                r.id === run?.id
                  ? "shrink-0 rounded-full bg-navy-800 px-3 py-1 text-xs font-semibold text-white"
                  : "shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            >
              {weekLabel(r.period_start, r.period_end)}
              {staff && r.partner_name ? ` · ${r.partner_name}` : ""}
              {r.mode === "shadow" ? " · preview" : ""}
            </Link>
          ))}
        </nav>
      )}

      {run?.mode === "shadow" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="font-semibold">Preview – not final pay.</span> Reece is checking these numbers against the manual payroll. You can
          still file tickets on them.
        </p>
      )}

      {run && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Payable this week" value={formatCents(payable)} />
          <Tile label="Lines" value={String(lines.length)} />
          <Tile label="Info only (not payable)" value={String(infoRows)} />
          <Tile label="Being reviewed" value={String(review)} />
        </div>
      )}

      {run && (
        <nav className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key })}
              className={
                t.key === tab
                  ? "shrink-0 whitespace-nowrap border-b-2 border-navy-800 px-3 py-2.5 text-sm font-semibold text-navy-900 dark:border-navy-300 dark:text-white"
                  : "shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-white"
              }
            >
              {t.label}{" "}
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.count}</span>
              {t.key !== "disputes" && t.payableCents > 0 && (
                <span className="ml-1 text-xs text-slate-500">{formatCents(t.payableCents)}</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      {run && program && (
        <Card>
          <CardContent>
            {shown.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No leads in this program this week.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-[12.5px] md:min-w-[46rem]">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      {/* Source and Agent are the lowest-value columns on a phone (CLAUDE.md, mobile). */}
                      {["Lead", "Customer", "Source", "Agent", "Date", "Amount", "Status", "Note", ""].map((h) => (
                        <th key={h} className={`pb-2 pr-3 font-medium ${h === "Source" || h === "Agent" ? "hidden md:table-cell" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {shown
                      .slice()
                      .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.lp_lead_id.localeCompare(b.lp_lead_id))
                      .map((l) => {
                        const b = lineStatusBadge(l.status);
                        const who = info[l.lp_lead_id];
                        const hasTicket = openByLine.has(l.id);
                        return (
                          <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 pr-3 font-mono">{l.lp_lead_id}</td>
                            <td className="py-2 pr-3">{who?.name ?? "—"}</td>
                            <td className="hidden py-2 pr-3 md:table-cell">{who?.source ?? l.campaign ?? "—"}</td>
                            <td className="hidden py-2 pr-3 md:table-cell">{l.agent_name ?? "—"}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{l.event_date}</td>
                            <td className="py-2 pr-3 font-mono">{formatCents(l.amount_cents)}</td>
                            <td className="py-2 pr-3"><Badge tone={b.tone}>{b.label}</Badge></td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                              {hasTicket ? <span className="text-amber-700 dark:text-amber-300">Ticket open</span> : (l.flag_reason ?? "")}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {canFile && canDisputeLine(l, hasTicket) && (
                                <DisputeLineButton
                                  ledgerId={l.id}
                                  leadLabel={`Lead ${l.lp_lead_id}${who?.name ? ` (${who.name})` : ""}`}
                                  eventType={l.event_type}
                                  amountCents={l.amount_cents}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(tab === "disputes" || !run) && (
        <Card>
          <CardContent>
            {disputes.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No tickets yet.{canFile ? " Use Dispute on a line, or Report a missing lead." : ""}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {disputes.map((d) => {
                  const b = disputeStatusBadge(d.status);
                  const who = info[d.lp_lead_id];
                  return (
                    <li key={d.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-navy-900 dark:text-white">#{d.id}</span>
                        <Badge tone={b.tone}>{b.label}</Badge>
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          Lead <span className="font-mono">{d.lp_lead_id}</span>
                          {who?.name ? ` · ${who.name}` : ""} · {eventLabel(d.event_type)}
                          {d.event_date ? ` · ${d.event_date}` : ""}
                        </span>
                        {!d.ledger_id && <Badge tone="sky">Missing lead</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">“{d.reason}”</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Filed by {d.filed_by_email} on {d.filed_at.slice(0, 10)}
                        {d.claimed_amount_cents != null ? ` · claimed ${formatCents(d.claimed_amount_cents)}` : ""}
                      </p>
                      {d.status !== "open" && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {d.status === "approved" ? "Approved" : "Denied"} by {d.decided_by ?? "Reece"}
                          {d.decided_at ? ` on ${d.decided_at.slice(0, 10)}` : ""}
                          {d.status === "approved" && d.approved_amount_cents != null ? ` · ${formatCents(d.approved_amount_cents)}` : ""}
                          {d.status === "approved" ? (d.applied_run_id ? " · added to payroll" : " · will be added to the next weekly run") : ""}
                          {d.decision_note ? ` — “${d.decision_note}”` : ""}
                        </p>
                      )}
                      {canDecide && d.status === "open" && (
                        <DecideTicket
                          disputeId={d.id}
                          defaultAmount={d.claimed_amount_cents != null ? (d.claimed_amount_cents / 100).toFixed(2) : ""}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 font-mono text-lg font-semibold text-navy-900 dark:text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
