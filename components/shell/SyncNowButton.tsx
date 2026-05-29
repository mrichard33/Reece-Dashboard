"use client";

import { useState, useTransition } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type SyncResult = { ok: boolean; error?: string };

// One message per service so partial outcomes read clearly ("HL synced · LP
// failed: …") instead of a single blended string.
function describe(label: string, res: SyncResult): string {
  return res.ok ? `${label} synced` : `${label} failed${res.error ? `: ${res.error}` : ""}`;
}

export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setErr(null);
    setOkMsg(null);
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

      if (lp.ok && hl.ok) {
        setOkMsg("Sync started for LP and HL");
      } else if (!lp.ok && !hl.ok) {
        setErr(`${describe("LP", lp)} · ${describe("HL", hl)}`);
      } else {
        // Partial: name the one that worked and the one that didn't.
        setErr(`${describe("HL", hl)} · ${describe("LP", lp)}`);
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
      {err ? (
        <span
          className="max-w-[24rem] truncate text-xs text-rose-600 dark:text-rose-400"
          title={err}
        >
          {err}
        </span>
      ) : okMsg ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {okMsg}
        </span>
      ) : null}
    </div>
  );
}
