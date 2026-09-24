"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LeadRow, LeadsCursor, LeadsPage } from "@/lib/queries/leadsList.core";
import { formatPhone } from "@/lib/journey/normalize";
import { humanizeTagValue } from "@/lib/journey/tags";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfoPopover } from "@/components/help/InfoPopover";
import { JourneyLoader } from "@/components/journey/JourneyCard";
import { cn, etShort, relTime } from "@/lib/utils";

const BOT_DOT: Record<LeadRow["bot"], { cls: string; label: string }> = {
  active: { cls: "bg-emerald-500", label: "Bot active" },
  stopped: { cls: "bg-slate-400", label: "Bot stopped" },
  dnc: { cls: "bg-rose-500", label: "Do not contact" },
  none: { cls: "bg-transparent ring-1 ring-slate-300 dark:ring-slate-600", label: "No bot" },
};

/**
 * Leads list: newest entry first, click a row to expand its Journey Card in
 * place. "Load more" appends the next keyset page from /api/leads/list with
 * the same filters (`query` is the page's own query string, minus the cursor).
 */
export function LeadsTable({ initial, query }: { initial: LeadsPage; query: string }) {
  const [rows, setRows] = useState<LeadRow[]>(initial.rows);
  const [cursor, setCursor] = useState<LeadsCursor>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams(query);
      sp.set("cursorDate", cursor.d);
      sp.set("cursorId", cursor.id);
      const res = await fetch(`/api/leads/list?${sp}`, { cache: "no-store" });
      if (!res.ok) return;
      const page = (await res.json()) as LeadsPage;
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">No leads match.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="w-6 py-2" />
              <th className="py-2 pr-3">Lead</th>
              <th className="py-2 pr-3">Entered</th>
              <th className="py-2 pr-3">Source / Lane</th>
              <th className="py-2 pr-3">Pipeline · Stage</th>
              <th className="py-2 pr-3">
                <span className="inline-flex items-center gap-1">
                  Now <InfoPopover helpKey="leads.now" align="left" />
                </span>
              </th>
              <th className="py-2 pr-3">LP</th>
              <th className="py-2 pr-3">Last activity</th>
              <th className="py-2 pr-3">
                <span className="inline-flex items-center gap-1">
                  Next <InfoPopover helpKey="leads.next" align="left" />
                </span>
              </th>
              <th className="py-2 pr-1">
                <span className="inline-flex items-center gap-1">
                  Bot <InfoPopover helpKey="leads.bot" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-200">
            {rows.map((r) => {
              const isOpen = open === r.ghlContactId;
              return (
                <Fragment key={r.ghlContactId}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : r.ghlContactId)}
                    className={cn(
                      "cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-800/50",
                      isOpen && "bg-slate-50 dark:bg-slate-800/50",
                    )}
                  >
                    <td className="py-2 pl-1">
                      <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", isOpen && "rotate-90")} />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-navy-900 dark:text-white">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        {[formatPhone(r.phone), r.city].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <div className="tabular-nums">{etShort(r.enteredAt)}</div>
                      <div className="text-slate-400">{relTime(r.enteredAt)}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <div>{r.source ?? "—"}</div>
                      {r.entryLane && <div className="text-slate-400">{humanizeTagValue(r.entryLane)}</div>}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.pipeline ? (
                        <>
                          <span className="font-medium">{r.pipeline}</span>
                          {r.stage && <div className="text-slate-500">{r.stage}</div>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {r.workflows.map((w) => (
                          <Badge key={w.code} tone={w.stopped ? "slate" : "navy"}>
                            {w.stopped ? `${w.code} — stopped` : w.name}
                          </Badge>
                        ))}
                        {r.stageTag && <Badge tone="sky">{humanizeTagValue(r.stageTag)}</Badge>}
                        {r.workflows.length === 0 && !r.stageTag && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.lpStatus && <div>{humanizeTagValue(r.lpStatus)}</div>}
                      {r.lpRoute && <div className="text-slate-500">{humanizeTagValue(r.lpRoute)}</div>}
                      {r.prospectId && <div className="text-slate-400">#{r.prospectId}</div>}
                      {!r.lpStatus && !r.lpRoute && !r.prospectId && <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{relTime(r.lastActivity)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {r.nextAppointment ? (
                        <>
                          <div className="tabular-nums">{etShort(r.nextAppointment.start)}</div>
                          <div className="flex flex-wrap items-center gap-1 text-slate-500">
                            {r.nextAppointment.label}
                            <Badge tone={r.nextAppointment.status === "confirmed" ? "emerald" : r.nextAppointment.status === "rescheduled" ? "amber" : "sky"}>
                              {r.nextAppointment.status === "confirmed" ? "Confirmed" : r.nextAppointment.status === "rescheduled" ? "Rescheduled" : r.nextAppointment.status === "booked" ? "Set" : r.nextAppointment.status}
                            </Badge>
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-1">
                      <span
                        title={BOT_DOT[r.bot].label}
                        aria-label={BOT_DOT[r.bot].label}
                        className={cn("inline-block h-2.5 w-2.5 rounded-full", BOT_DOT[r.bot].cls)}
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="bg-white px-3 pb-4 pt-2 dark:bg-slate-900">
                        <JourneyLoader ghlContactId={r.ghlContactId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="pt-4 text-center">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
