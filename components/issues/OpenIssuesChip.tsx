"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useOpenIssuesCount } from "./useOpenIssuesCount";

/**
 * Top-bar attention chip. Renders only when there are open issues (attention
 * semantics) and links to /issues. Count comes from the shared poll so it stays
 * in lockstep with the sidebar nav badge.
 */
export function OpenIssuesChip() {
  const count = useOpenIssuesCount();
  if (!count || count <= 0) return null;

  return (
    <Link
      href="/issues"
      title={`${count} open issue${count === 1 ? "" : "s"}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      {count} open
    </Link>
  );
}
