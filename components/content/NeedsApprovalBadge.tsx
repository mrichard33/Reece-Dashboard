"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

const POLL_MS = 25_000;

/** Header chip showing the count of drafts awaiting approval. Polls like the
 *  Executive Review NotificationBell (no realtime config needed). */
export function NeedsApprovalBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/content/needs-approval", { cache: "no-store" });
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

  const n = count ?? 0;
  return (
    <Link
      href="/content?filter=needs"
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset " +
        (n > 0
          ? "bg-brick-50 text-brick-700 ring-brick-200 dark:bg-brick-900 dark:text-brick-100 dark:ring-brick-700"
          : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700")
      }
    >
      <ClipboardCheck className="h-3.5 w-3.5" />
      Needs Approval{count !== null ? ` (${n})` : ""}
    </Link>
  );
}
