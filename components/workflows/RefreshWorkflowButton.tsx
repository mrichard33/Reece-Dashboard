"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Result = { ok: boolean; version?: number | null; error?: string };

/**
 * "Refresh from GHL" (2026-10-07): pulls this one workflow fresh from GHL
 * (HL-MCP refresh_workflow), then reloads the page. For "I just changed it in
 * GHL and want to see it now"; the hourly catch-up in HL-MCP does it anyway.
 */
export function RefreshWorkflowButton({ workflowId, shownVersion }: { workflowId: string; shownVersion: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = (await fetch(`/api/workflows/${workflowId}/refresh`, { method: "POST" })
        .then((r) => r.json())
        .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "request failed" }))) as Result;
      if (res.ok) {
        setMsg({ text: res.version ? `Updated to v${res.version}` : "Updated", bad: false });
      } else {
        const still = shownVersion !== null ? ` Still showing v${shownVersion}.` : "";
        setMsg({ text: `${res.error ?? "Refresh failed."}${still}`, bad: true });
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Button variant="secondary" size="sm" onClick={refresh} disabled={working} className="w-full justify-center sm:w-auto">
        <RefreshCw className={`h-3.5 w-3.5 ${working ? "animate-spin" : ""}`} />
        {working ? "Refreshing…" : "Refresh from GHL"}
      </Button>
      {msg && (
        <span role="status" className={`break-words text-xs ${msg.bad ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
