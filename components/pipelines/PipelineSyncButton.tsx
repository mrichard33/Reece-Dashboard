"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type SyncResult = { ok: boolean; error?: string };

/** Compact, HL-only "Sync now" for a pipeline card. Pipelines + opps both come
 *  from the HL cache, so this hits the HL sync endpoint only, then refreshes. */
export function PipelineSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setErr(null);
    try {
      const res = (await fetch("/api/sync/hl", { method: "POST" })
        .then((r) => r.json())
        .catch((e: unknown) => ({
          ok: false,
          error: e instanceof Error ? e.message : "sync request failed",
        }))) as SyncResult;
      if (!res.ok) setErr(res.error ?? "sync failed");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {err ? (
        <span className="max-w-[12rem] truncate text-xs text-rose-600 dark:text-rose-400" title={err}>
          {err}
        </span>
      ) : null}
      <Button variant="secondary" size="sm" onClick={sync} disabled={busy || pending}>
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
