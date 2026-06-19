"use client";

import { useEffect, useState } from "react";

const POLL_MS = 25_000;

/**
 * Polls `/api/issues/count` for the open-issue count — the single source of
 * truth behind the top-bar attention chip and the sidebar nav badge. Returns
 * `null` until the first response lands. Mirrors the NeedsApprovalBadge poll.
 */
export function useOpenIssuesCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/issues/count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (alive) setCount(data.count);
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

  return count;
}
