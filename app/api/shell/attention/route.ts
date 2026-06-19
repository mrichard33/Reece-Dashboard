import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/auth";
import { openIssuesSummary } from "@/lib/queries/issues";
import { pendingApprovalsCount } from "@/lib/queries/approvals";
import { servicesWatchingCount } from "@/lib/queries/health";

export const dynamic = "force-dynamic";

export type AttentionCounts = {
  openIssues: number;
  urgentIssues: number;
  approvalsWaiting: number;
  servicesWatching: number;
};

/**
 * Single source of truth for the shell's attention surfaces: the top-bar chips
 * and the sidebar nav badges. Any authenticated dashboard user. Each count
 * degrades to 0 independently, so a single failing dependency never blanks the
 * whole row.
 */
export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [issues, approvalsWaiting, servicesWatching] = await Promise.all([
    openIssuesSummary(),
    pendingApprovalsCount(),
    servicesWatchingCount(),
  ]);

  const body: AttentionCounts = {
    openIssues: issues.open,
    urgentIssues: issues.urgent,
    approvalsWaiting,
    servicesWatching,
  };
  return NextResponse.json(body);
}
