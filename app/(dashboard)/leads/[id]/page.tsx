import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LeadFeed } from "@/components/leads/LeadFeed";
import {
  getLeadActivities,
  getLeadCalls,
  getLeadHeader,
  getLeadNotes,
} from "@/lib/queries/leads";
import { usd } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  // First page of every feed in parallel — each is a keyset page (no count, no
  // OFFSET), so this is three cheap index range-scans.
  const [lead, calls, notes, activities] = await Promise.all([
    getLeadHeader(id),
    getLeadCalls(id),
    getLeadNotes(id),
    getLeadActivities(id),
  ]);

  if (!lead) notFound();

  const name =
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
    "Unknown contact";

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title={name}
        subtitle="Call history, notes & activity"
      />

      <div className="space-y-6 p-6">
        <Link
          href="/overview"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {lead.disposition_label && (
            <Badge tone="navy" dot>
              {lead.disposition_label}
            </Badge>
          )}
          {lead.lead_source && (
            <span className="text-xs text-slate-500">Source: {lead.lead_source}</span>
          )}
          {lead.rep_name && (
            <span className="text-xs text-slate-500">· Rep: {lead.rep_name}</span>
          )}
          {lead.job_value ? (
            <span className="text-xs text-slate-500">· {usd(lead.job_value)}</span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Call History</CardTitle>
              </CardHeader>
              <CardContent>
                <LeadFeed leadId={id} type="calls" initial={calls} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <LeadFeed leadId={id} type="notes" initial={notes} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <LeadFeed leadId={id} type="activities" initial={activities} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
