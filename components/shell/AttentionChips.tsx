"use client";

import Link from "next/link";
import { ClipboardCheck, AlertTriangle, Activity } from "lucide-react";
import { useAttention } from "./useAttention";

const baseChip =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition";

/**
 * The top-bar attention chips: approvals waiting, open issues (with urgent
 * count), and services watching. Each renders only when its count is > 0
 * (attention semantics) and links to the relevant page. Counts come from the
 * shared `/api/shell/attention` poll, so they stay in lockstep with the sidebar
 * nav badges.
 */
export function AttentionChips() {
  const a = useAttention();
  if (!a) return null;

  return (
    <div className="hidden items-center gap-2 md:flex">
      {a.approvalsWaiting > 0 && (
        <Link
          href="/approvals"
          className={`${baseChip} bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900`}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {a.approvalsWaiting} approval{a.approvalsWaiting === 1 ? "" : "s"} waiting
        </Link>
      )}

      {a.openIssues > 0 && (
        <Link
          href="/issues"
          className={`${baseChip} bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {a.openIssues} open issue{a.openIssues === 1 ? "" : "s"}
          {a.urgentIssues > 0 && (
            <span className="font-normal opacity-80">· {a.urgentIssues} urgent</span>
          )}
        </Link>
      )}

      {a.servicesWatching > 0 && (
        <Link
          href="/overview"
          className={`${baseChip} bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900`}
        >
          <Activity className="h-3.5 w-3.5" />
          {a.servicesWatching} service{a.servicesWatching === 1 ? "" : "s"} watching
        </Link>
      )}
    </div>
  );
}
