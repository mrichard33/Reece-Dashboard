"use client";

import { useState, useTransition } from "react";
import { Loader2, Plug, RefreshCw, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { mcpErrorPresentation } from "@/components/tiles/McpStatusTile";
import { relTime } from "@/lib/utils";
import {
  pingMcp,
  triggerMcpSync,
  reloadDecisionEngine,
} from "@/lib/actions/settings";

export type ServiceConfig = {
  key: "lp" | "hl";
  label: string;
  urlConfigured: boolean;
  tokenConfigured: boolean;
  lastSyncAt: string | null;
  failure24h: string | null;
};

type PingState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; kind: string; message: string };

export function ConnectionsPanel({ services }: { services: ServiceConfig[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {services.map((s) => (
            <ServiceRow key={s.key} service={s} />
          ))}

          <ReloadEngineRow />
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceRow({ service }: { service: ServiceConfig }) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<"ping" | "sync" | null>(null);
  const [ping, setPing] = useState<PingState>({ status: "idle" });
  const [syncMsg, setSyncMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  function runPing() {
    setActive("ping");
    setSyncMsg(null);
    startTransition(async () => {
      const res = await pingMcp(service.key);
      if (res.ok) setPing({ status: "ok" });
      else setPing({ status: "error", kind: res.kind, message: res.message });
    });
  }

  function runSync() {
    if (!window.confirm(`Trigger a full ${service.label} sync now?`)) return;
    setActive("sync");
    setSyncMsg(null);
    startTransition(async () => {
      const res = await triggerMcpSync(service.key);
      if (!res.ok) setSyncMsg({ tone: "error", text: res.error ?? "Sync failed." });
      else setSyncMsg({ tone: "info", text: `Sync triggered. ${summarize(res.result)}` });
    });
  }

  const busy = (k: "ping" | "sync") => pending && active === k;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-navy-900 dark:text-slate-100">{service.label}</p>
        <div className="flex gap-1">
          <Badge tone={service.urlConfigured ? "emerald" : "amber"}>
            {service.urlConfigured ? "URL set" : "no URL"}
          </Badge>
          <Badge tone={service.tokenConfigured ? "emerald" : "slate"}>
            {service.tokenConfigured ? "token set" : "no token"}
          </Badge>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Last sync {service.lastSyncAt ? relTime(service.lastSyncAt) : "—"}
        {service.failure24h ? ` · 24h: ${service.failure24h}` : ""}
      </p>

      {/* Live ping result */}
      {ping.status === "ok" && (
        <div className="flex items-center gap-2">
          <StatusDot status="healthy" animate={false} />
          <span className="text-[11px] text-emerald-600">Reachable — responded OK.</span>
        </div>
      )}
      {ping.status === "error" && (
        <PingError kind={ping.kind} message={ping.message} />
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={runPing}>
          {busy("ping") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}{" "}
          Ping
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={runSync}>
          {busy("sync") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{" "}
          Sync now
        </Button>
      </div>

      {syncMsg && (
        <p className={syncMsg.tone === "error" ? "text-[11px] text-rose-600" : "text-[11px] text-emerald-600"}>
          {syncMsg.text}
        </p>
      )}
    </div>
  );
}

function PingError({ kind, message }: { kind: string; message: string }) {
  const { dot, tone, heading } = mcpErrorPresentation(
    (kind as Parameters<typeof mcpErrorPresentation>[0]) ?? "unknown",
  );
  return (
    <div className="flex items-start gap-2">
      <StatusDot status={dot} animate={false} />
      <div>
        <Badge tone={tone}>{heading}</Badge>
        <p className="mt-1 break-words text-[11px] text-slate-600 dark:text-slate-300">{message}</p>
      </div>
    </div>
  );
}

function ReloadEngineRow() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const res = await reloadDecisionEngine();
      if (res.error) setMsg({ tone: "error", text: res.error });
      else
        setMsg({
          tone: res.ok ? "info" : "error",
          text: `HTTP ${res.status ?? "?"} — ${res.body?.slice(0, 300) || "(no body)"}`,
        });
    });
  }

  return (
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-navy-900 dark:text-slate-100">
            Decision engine rules
          </p>
          <p className="text-[11px] text-slate-400">
            Reload the LP decision-engine rules without a redeploy.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={pending} onClick={run}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}{" "}
          Reload
        </Button>
      </div>
      {msg && (
        <p className={msg.tone === "error" ? "mt-2 break-words text-[11px] text-rose-600" : "mt-2 break-words text-[11px] text-emerald-600"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function summarize(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const entries = Object.entries(result as Record<string, unknown>).slice(0, 6);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}
