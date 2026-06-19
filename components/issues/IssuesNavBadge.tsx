"use client";

import { useOpenIssuesCount } from "./useOpenIssuesCount";

/**
 * Rose count pill for the sidebar "Issues" nav item. Renders in the right-side
 * slot (otherwise used for phase stubs). Shows only when there are open issues.
 */
export function IssuesNavBadge() {
  const count = useOpenIssuesCount();
  if (!count || count <= 0) return null;

  return (
    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
      {count}
    </span>
  );
}
