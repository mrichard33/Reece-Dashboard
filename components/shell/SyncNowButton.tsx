"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type SyncResult = { ok: boolean; error?: string };

export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setErr(null);
    try {
      const [lp, hl] = await Promise.all([
        fetch("/api/sync/lp", { method: "POST" })
          .then((r) => r.json() as Promise<SyncResult>)
          .catch((e: unknown) => ({
            ok: false,
            error: e instanceof Error ? e.message : "LP request failed",
          })),
        fetch("/api/sync/hl", { method: "POST" })
          .then((r) => r.json() as Promise<SyncResult>)
          .catch((e: unknown) => ({
            ok: false,
            error: e instanceof Error ? e.message : "HL request failed",
          })),
      ]);

      if (!lp.ok && !hl.ok) {
        const parts = [
          lp.error ? `LP: ${lp.error}` : null,
          hl.error ? `HL: ${hl.error}` : null,
        ].filter(Boolean);
        setErr(parts.length > 0 ? parts.join(" · ") : "Both syncs failed.");
        return;
      }
      if (!lp.ok) {
        setErr(`LP sync failed${lp.error ? `: ${lp.error}` : ""}`);
      } else if (!hl.ok) {
        setErr(`HL sync failed${hl.error ? `: ${hl.error}` : ""}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={sync}
        disabled={busy || pending}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>
      {err && (
        <span
          className="max-w-[24rem] truncate text-xs text-rose-600 dark:text-rose-400"
          title={err}
        >
          {err}
        </span>
      )}
    </div>
  );
}
