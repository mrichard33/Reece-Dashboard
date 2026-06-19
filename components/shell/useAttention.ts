"use client";

import { useEffect, useState } from "react";
import type { AttentionCounts } from "@/app/api/shell/attention/route";

const POLL_MS = 25_000;

/**
 * Polls `/api/shell/attention` for the shell's attention counts (open/urgent
 * issues, approvals waiting, services watching) — the single source of truth
 * behind the top-bar chips and the sidebar nav badges. Returns `null` until the
 * first response lands. Mirrors the NeedsApprovalBadge poll cadence.
 */
export function useAttention(): AttentionCounts | null {
  const [counts, setCounts] = useState<AttentionCounts | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/shell/attention", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as AttentionCounts;
        if (alive) setCounts(data);
      } catch {
        /* transient */
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return counts;
}
