import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { SystemCards } from "@/components/health/SystemCards";
import { RunChecksButton } from "@/components/health/HealthActions";
import { getSystemHealthPage } from "@/lib/queries/systemHealth";
import { SYSTEMS } from "@/lib/queries/systemStatus.core";
import { allInTestMode, attentionLine } from "@/lib/health/words";
import { relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * System health — every check LP-MCP runs, grouped by system (2026-10-15).
 * Colors come from `v_health_check_latest`: no result (or one past its stale
 * window) is red for an Urgent check and yellow otherwise; a check still in
 * test mode (LP-MCP mode "shadow") is drawn as a ring. Everyone can see the
 * board; running checks is operators only. The words are plain English
 * (the user, 2026-10-15): lib/health/words.ts.
 */
export default async function SystemHealthPage({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const page = await getSystemHealthPage();
  const only = SYSTEMS.some((s) => s.id === params.system) ? params.system! : null;
  const testMode = page.state === "ok" && allInTestMode(page.systems.flatMap((s) => s.families.flatMap((f) => f.checks)));

  return (
    <>
      <TopBar email={user.email} role={user.role} title="System health" subtitle="Every check, every system" />
      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="System health"
          subtitle={page.state === "ok"
            ? `${attentionLine(page.counts)} · last checked ${page.lastEvaluatedAt ? relTime(page.lastEvaluatedAt) : "never"}`
            : "Checks run every few minutes"}
          action={user.role === "operator" ? <RunChecksButton /> : undefined}
        />

        {page.state !== "ok" ? (
          <Card>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {page.state === "missing" ? "The health views are not in the database yet (LP-MCP migration 20261015120000)." : `Could not read the health views: ${page.state === "error" ? page.message : ""}`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {testMode && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                These checks are in test mode: they record results but don&apos;t send alerts yet.
              </p>
            )}
            {only && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Showing {SYSTEMS.find((s) => s.id === only)?.label}.{" "}
                <Link href={"/system-health" as Route} className="underline">Show every system</Link>
              </p>
            )}
            <SystemCards systems={page.systems} timelines={page.timelines} only={only} />
          </>
        )}
      </div>
    </>
  );
}

