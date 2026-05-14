"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

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
        fetch("/api/sync/lp", { method: "POST" }).then((r) => r.json()),
        fetch("/api/sync/hl", { method: "POST" }).then((r) => r.json()),
      ]);
      if (!lp.ok && !hl.ok) {
        setErr("Both syncs failed.");
        return;
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
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}
