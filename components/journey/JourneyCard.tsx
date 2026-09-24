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
  active: { tone: "emerald", label: "Bot on" },
  stopped: { tone: "slate", label: "Bot stopped" },
  dnc: { tone: "rose", label: "Do not contact" },
  none: { tone: "slate", label: "No bot" },
};

/**
 * One lead, told simply (v2, 2026-09-25): who they are, three lines for
 * Now / Next / Last contact, then one timeline. Read-only.
 */
export function JourneyCard({ initial, variant = "full" }: { initial: Journey; variant?: "inline" | "full" }) {
  const [j, setJ] = useState<Journey>(initial);
  const [refreshing, setRefreshing] = useState(false);

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
  const next = nextThing(j);
  const lastContact = [j.now.lastCall, j.now.lastMessage].filter(Boolean).sort((a, b) => b!.ts.localeCompare(a!.ts))[0] ?? null;

  return (
    <div className="space-y-4">
      {j.header.deletedAt && (
        <Notice tone="slate">This contact was deleted in GHL on {etDateTime(j.header.deletedAt)}. Showing the history we kept.</Notice>
      )}
      {j.sources.lp !== "ok" && (
        <Notice tone="amber">
          <AlertTriangle className="h-3.5 w-3.5" /> Lead Perfection could not be read just now — calls and notes are missing. Try Refresh.
        </Notice>
      )}

      {/* Who */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-navy-900 dark:text-white">
            {h.name}
            <span className="font-normal text-slate-500">{[formatPhone(h.phone), h.city].filter(Boolean).map((x) => ` · ${x}`)}</span>
          </p>
          <p className="text-xs text-slate-500">
            {[
              h.source,
              h.pipeline ? `${h.pipeline}${h.stage ? ` · ${h.stage}` : ""}` : null,
              h.lp.disposition ? `LP: ${h.lp.disposition}` : null,
              h.lp.prospectId ? `Prospect ${h.lp.prospectId}${h.lp.leadIds.length > 1 ? ` (${h.lp.leadIds.length} LP leads)` : ""}` : null,
              h.lp.rep ? `Rep: ${h.lp.rep}` : null,
              h.enteredAt ? `Came in ${etShort(h.enteredAt)}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone={bot.tone} dot>
            {bot.label}
          </Badge>
          <a
            href={ghlContactUrl(h.ghlContactId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline dark:text-sky-400"
          >
            GHL <ExternalLink className="h-3 w-3" />
          </a>
          {variant === "inline" && (
            <Link href={`/leads/${h.ghlContactId}` as Route} className="text-xs text-sky-700 hover:underline dark:text-sky-400">
              Full page ↗
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing} title="Re-read GHL and LP now">
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Now / Next / Last contact */}
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
        <Row label="Now" help="leads.now">
          {nowLine(j)}
        </Row>
        <Row label="Next" help="leads.next">
          {next ? (
            <>
              <span className="font-medium">{etShort(next.ts)} ET</span> — {next.title}
              {next.projected && <span className="ml-1 text-[11px] italic text-slate-400">(projected)</span>}
            </>
          ) : (
            <span className="text-slate-500">
              {j.now.suppression
                ? j.now.suppression.kind === "texts"
                  ? "Texts stopped (STOP) — no emails scheduled"
                  : `${j.now.suppression.kind === "stopped" ? "Automation stopped" : "Nurture paused"} (${j.now.suppression.reason}) — nothing scheduled`
                : "Nothing scheduled"}
            </span>
          )}
        </Row>
        <Row label="Last contact">
          {lastContact ? (
            <>
              {lastContact.title.length > 90 ? `${lastContact.title.slice(0, 89)}…` : lastContact.title}
              <span className="text-slate-400"> · {relTime(lastContact.ts)}</span>
            </>
          ) : (
            <span className="text-slate-500">No calls or messages yet</span>
          )}
        </Row>
      </div>
      <p className="-mt-2 text-[11px] text-slate-500">
        {j.stats.messagesOut} messages out · {j.stats.messagesIn} in · {j.stats.calls} calls · {j.stats.appts} appointments
        {j.stats.workflows.length ? ` · workflows: ${j.stats.workflows.join(", ")}` : ""}
      </p>

      <Timeline events={j.events} next={j.next} maxHeightClass={variant === "inline" ? "max-h-[26rem]" : "max-h-[44rem]"} />

      <p className="text-right text-[10px] text-slate-400">Updated {relTime(j.builtAt)} · times in ET</p>
    </div>
  );
}

function nowLine(j: Journey) {
  const h = j.header;
  const parts: React.ReactNode[] = [];
  if (h.activeWorkflows.length) {
    parts.push(
      <span key="wf" className="inline-flex flex-wrap items-center gap-1">
        {h.activeWorkflows.map((w) => {
          const label = w.stopped ? `${w.name} — stopped` : w.name;
          const badge = <Badge tone={w.stopped ? "slate" : "navy"}>{label}</Badge>;
          return w.ghlWorkflowId ? (
            <Link key={w.code} href={`/workflows/${w.ghlWorkflowId}` as Route}>
              {badge}
            </Link>
          ) : (
            <span key={w.code}>{badge}</span>
          );
        })}
        {j.now.workflowPosition && !h.activeWorkflows.some((w) => w.stopped) && (
          <span className="text-xs text-slate-500">{j.now.workflowPosition}</span>
        )}
      </span>,
    );
  } else {
    parts.push(
      <span key="wf" className="text-slate-500">
        Not in a workflow
      </span>,
    );
  }
  if (h.stageTag) parts.push(<span key="st">stage: {humanizeTagValue(h.stageTag)}</span>);
  if (j.now.openAppointment) parts.push(<span key="ap">{j.now.openAppointment.title}</span>);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-x-3">
          {i > 0 && <span className="text-slate-300">·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}

/** Next = the sooner of the next projected send and the next appointment. */
function nextThing(j: Journey): (JourneyEvent & { projected?: boolean }) | null {
  const appt = j.now.openAppointment && j.now.openAppointment.kind === "appointment_upcoming" ? j.now.openAppointment : null;
  const send = j.next[0] ?? null;
  if (appt && send) return appt.ts <= send.ts ? appt : send;
  return appt ?? send;
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <span className="flex w-24 shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {help && <InfoPopover helpKey={help} align="left" />}
      </span>
      <span className="min-w-0 flex-1 text-navy-900 dark:text-slate-100">{children}</span>
    </div>
  );
}

function Notice({ tone, children }: { tone: "amber" | "slate"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
        tone === "amber"
          ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
      )}
    >
      {children}
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
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  return <JourneyCard initial={state.j} variant="inline" />;
}
