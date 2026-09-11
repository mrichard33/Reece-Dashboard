"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { usePolledJson } from "@/lib/usePolledJson";

const POLL_MS = 25_000;

/** Header chip showing the count of drafts awaiting approval. Polls like the
 *  Executive Review NotificationBell (no realtime config needed), and pauses
 *  while the tab is hidden. */
export function NeedsApprovalBadge() {
  const data = usePolledJson<{ count: number }>("/api/content/needs-approval", POLL_MS);
  const count = data?.count ?? null;

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
