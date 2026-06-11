"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plug, KeyRound, Save, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  saveFbSettings,
  saveFbToken,
  testFbConnection,
  setAutoPublish,
  type FbConnectionStatus,
} from "@/lib/actions/settings";

function statusBadge(c: FbConnectionStatus | null) {
  if (!c?.configured) return <Badge tone="amber" dot>Not configured</Badge>;
  if (c.enabled) return <Badge tone="emerald" dot>Live — auto-publishing</Badge>;
  return <Badge tone="slate" dot>Configured — auto-publish OFF</Badge>;
}

export function FbConnectionCard({ connection }: { connection: FbConnectionStatus | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const [pageId, setPageId] = useState(connection?.pageId ?? "");
  const [graphVersion, setGraphVersion] = useState(connection?.graphVersion ?? "v23.0");
  const [token, setToken] = useState("");

  const busy = (key: string) => pending && activeKey === key;

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
      else {
        if (res.error) setMsg({ tone: "info", text: res.error });
        else if (okText) setMsg({ tone: "info", text: okText });
        router.refresh();
      }
    });
  }

  const tokenSaved = Boolean(connection?.tokenLast4);
  const tokenPlaceholder = tokenSaved ? `••••••••${connection!.tokenLast4}` : "Paste the Page access token";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facebook Page Connection</CardTitle>
        {statusBadge(connection)}
      </CardHeader>
      <CardContent>
        {connection?.pageName && (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            Connected to: <span className="font-medium">{connection.pageName}</span>
          </p>
        )}

        <div className="space-y-4">
          {/* Page ID + Graph version */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Page ID</label>
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="e.g. 1029384756"
              className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Graph API version
            </label>
            <input
              value={graphVersion}
              onChange={(e) => setGraphVersion(e.target.value)}
              placeholder="v23.0"
              className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run("save-settings", () => saveFbSettings({ fb_page_id: pageId, fb_graph_version: graphVersion }), "Saved.")
            }
          >
            {busy("save-settings") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{" "}
            Save Page ID & version
          </Button>

          {/* Token (write-only) */}
          <div className="space-y-1.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Page Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={tokenPlaceholder}
              autoComplete="off"
              className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="text-xs text-slate-400">
              Write-only. The current token is never displayed.
              {connection?.tokenUpdatedAt &&
                ` Token saved ${new Date(connection.tokenUpdatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}.`}
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || token.trim().length === 0}
              onClick={() =>
                run("save-token", async () => {
                  const res = await saveFbToken(token);
                  if (res.ok) setToken("");
                  return res;
                }, "Token saved.")
              }
            >
              {busy("save-token") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}{" "}
              Save token
            </Button>
          </div>

          {/* Test connection */}
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run("test", async () => {
                  const res = await testFbConnection();
                  if (res.ok && res.pageName)
                    setMsg({ tone: "info", text: `Connected to ${res.pageName}.` });
                  return res;
                })
              }
            >
              {busy("test") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}{" "}
              Test Connection
            </Button>
          </div>

          {/* Auto-publish toggle */}
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto-publish</span>
              <Button
                size="sm"
                variant={connection?.enabled ? "danger" : "primary"}
                disabled={pending}
                onClick={() =>
                  run("toggle", () => setAutoPublish(!connection?.enabled))
                }
              >
                {busy("toggle") ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Power className="h-3.5 w-3.5" />
                )}{" "}
                {connection?.enabled ? "Turn OFF" : "Turn ON"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              When ON, approved posts targeted at the Page publish automatically within ~2 minutes.
              Turn OFF to pause publishing instantly without touching n8n.
            </p>
          </div>

          {msg && (
            <p className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-emerald-600"}>
              {msg.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
