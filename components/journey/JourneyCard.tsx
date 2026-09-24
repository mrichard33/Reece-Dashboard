"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import type { BotState, Journey, JourneyEvent } from "@/lib/journey/types";
import { formatPhone, ghlContactUrl } from "@/lib/journey/normalize";
import { humanizeTagValue } from "@/lib/journey/tags";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { InfoPopover } from "@/components/help/InfoPopover";
import { cn, etDateTime, etShort, relTime } from "@/lib/utils";
import { Timeline } from "./Timeline";

const BOT: Record<BotState, { tone: BadgeTone; label: string }> = {
  active: { tone: "emerald", label: "Bot active" },
  stopped: { tone: "slate", label: "Bot stopped" },
  dnc: { tone: "rose", label: "Do not contact" },
  none: { tone: "slate", label: "No bot" },
};

/**
 * Past / Now / Next for one contact (spec §B4). Used inline under a Leads row
 * and full-width on /leads/[id]. Read-only: nothing here writes a tag, a
 * field or a message.
 */
export function JourneyCard({ initial, variant = "full" }: { initial: Journey; variant?: "inline" | "full" }) {
  const [j, setJ] = useState<Journey>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [showTags, setShowTags] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/leads/${j.header.ghlContactId}/journey?fresh=1`, { cache: "no-store" });
      if (res.ok) setJ((await res.json()) as Journey);
    } finally {
      setRefreshing(false);
    }
  }

  const h = j.header;
  const bot = BOT[h.bot];
  const lpLine = [
    h.lp.disposition ? `LP: ${h.lp.disposition}` : null,
    h.lp.route ? `route ${humanizeTagValue(h.lp.route)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      {j.sources.lp !== "ok" && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" />
          {j.sources.lp === "unconfigured"
            ? "LP activity unavailable — LP MCP is not configured on this dashboard. Showing GHL only."
            : "LP activity unavailable — LP MCP did not answer. Showing GHL only; calls, notes and rules are missing."}
        </div>
      )}

      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold text-navy-900 dark:text-white">
            {h.name}
            <span className="font-normal text-slate-500">
              {[formatPhone(h.phone), h.city].filter(Boolean).map((x) => ` · ${x}`)}
            </span>
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {[
              [h.source, h.entryLane ? `${humanizeTagValue(h.entryLane)} lane` : null].filter(Boolean).join(" → "),
              h.pipeline ? `${h.pipeline}${h.stage ? ` ${h.stage}` : ""}` : null,
              lpLine || null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          <p className="text-xs text-slate-500">
            {[
              h.lp.prospectId ? `Prospect ${h.lp.prospectId}` : null,
              h.lp.leadId ? `LP lead ${h.lp.leadId}` : null,
              h.lp.rep ? `Rep: ${h.lp.rep}` : null,
              h.enteredAt ? `Entered ${etDateTime(h.enteredAt)}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <Badge tone={bot.tone} dot>
              {bot.label}
            </Badge>
            <InfoPopover helpKey="leads.bot" />
          </span>
          <a
            href={ghlContactUrl(h.ghlContactId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sky-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:text-sky-400 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            Open in GHL <ExternalLink className="h-3 w-3" />
          </a>
          {variant === "inline" && (
            <Link
              href={`/leads/${h.ghlContactId}` as Route}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-navy-800 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Open full page ↗
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing} title="Re-read GHL and LP now">
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Now / Next / At a glance ────────────────────────────────── */}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-3 md:overflow-visible">
        <Panel title="Now" helpKey="leads.now">
          <Line label="Workflow">
            {h.activeWorkflows.length ? (
              <span className="flex flex-wrap gap-1">
                {h.activeWorkflows.map((w) =>
                  w.ghlWorkflowId ? (
                    <Link key={w.code} href={`/workflows/${w.ghlWorkflowId}` as Route}>
                      <Badge tone="navy">{w.name}</Badge>
                    </Link>
                  ) : (
                    <Badge key={w.code} tone="navy">
                      {w.name}
                    </Badge>
                  ),
                )}
              </span>
            ) : (
              <span className="text-slate-400">None active</span>
            )}
          </Line>
          {j.now.workflowPosition && <Line label="Step">{j.now.workflowPosition}</Line>}
          {h.stageTag && (
            <Line label="Stage">
              <Badge tone="sky">{humanizeTagValue(h.stageTag)}</Badge>
            </Line>
          )}
          <Line label="Appt">{j.now.openAppointment ? j.now.openAppointment.title : <span className="text-slate-400">None</span>}</Line>
          <Line label="Last call">{summary(j.now.lastCall)}</Line>
          <Line label="Last msg">{summary(j.now.lastMessage)}</Line>
          <Line label="Tags">
            <button type="button" onClick={() => setShowTags((v) => !v)} className="text-sky-700 hover:underline dark:text-sky-400">
              {h.tags.length} ({showTags ? "hide" : "show"})
            </button>
          </Line>
        </Panel>

        <Panel title="Next" helpKey="leads.next">
          {j.now.suppression && (
            <p
              className="mb-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="Direct replies to the contact's own messages are never blocked by these tags (always-respond policy)."
            >
              {j.now.suppression.kind === "stopped" ? "Automation stopped" : "Nurture paused"} ({j.now.suppression.reason})
            </p>
          )}
          {j.next.length === 0 ? (
            <p className="text-xs text-slate-400">
              {h.activeWorkflows.length ? "No sends projected in the next 30 days." : "Not in a workflow — nothing scheduled."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {j.next.slice(0, 4).map((e) => (
                <li key={e.id} className="text-xs">
                  <span className="font-medium text-navy-900 dark:text-slate-100">{etShort(e.ts)} ET</span>
                  <span className="block italic text-slate-500">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="At a glance" helpKey="leads.glance">
          <Line label="Messages">
            {j.stats.messagesOut} out · {j.stats.messagesIn} in
          </Line>
          <Line label="Calls">{j.stats.calls}</Line>
          <Line label="Appts">{j.stats.appts}</Line>
          <Line label="Workflows">{j.stats.workflows.length ? j.stats.workflows.join(", ") : "—"}</Line>
          <Line label="LP notes">{j.stats.notes}</Line>
        </Panel>
      </div>

      {showTags && (
        <div className="flex flex-wrap gap-1 rounded-md bg-slate-50 p-2 dark:bg-slate-800/50">
          {h.tags.map((t) => (
            <span key={t} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
              {t}
            </span>
          ))}
        </div>
      )}

      <Timeline events={j.events} next={j.next} maxHeightClass={variant === "inline" ? "max-h-[26rem]" : "max-h-[40rem]"} />

      <p className="text-right text-[10px] text-slate-400">Built {relTime(j.builtAt)} · times in ET</p>
    </div>
  );
}

function summary(e: JourneyEvent | null) {
  if (!e) return <span className="text-slate-400">—</span>;
  return (
    <span>
      {e.title.length > 60 ? `${e.title.slice(0, 59)}…` : e.title}
      <span className="text-slate-400"> · {etShort(e.ts)}</span>
    </span>
  );
}

function Panel({ title, helpKey, children }: { title: string; helpKey: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[16rem] snap-start rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        <InfoPopover helpKey={helpKey} />
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-16 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 break-words text-navy-900 dark:text-slate-100">{children}</span>
    </div>
  );
}

/** Fetches a journey on mount — the Leads table's expanded row. */
export function JourneyLoader({ ghlContactId }: { ghlContactId: string }) {
  const [state, setState] = useState<{ j: Journey | null; error: string | null }>({ j: null, error: null });

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${ghlContactId}/journey`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setState({ j: null, error: (body as { error?: string }).error ?? `HTTP ${res.status}` });
        else setState({ j: body as Journey, error: null });
      })
      .catch(() => alive && setState({ j: null, error: "Could not reach the dashboard server." }));
    return () => {
      alive = false;
    };
  }, [ghlContactId]);

  if (state.error) return <p className="py-4 text-sm text-rose-600 dark:text-rose-400">{state.error}</p>;
  if (!state.j)
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  return <JourneyCard initial={state.j} variant="inline" />;
}
