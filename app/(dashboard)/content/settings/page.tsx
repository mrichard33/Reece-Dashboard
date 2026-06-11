import Link from "next/link";
import { listExecutives } from "@/lib/queries/approvals";
import { getFbTuning } from "@/lib/queries/content";
import { getFbConnection } from "@/lib/actions/settings";
import { getAccessContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FbConnectionCard } from "@/components/settings/FbConnectionCard";
import { TuningCard } from "@/components/settings/TuningCard";

export const dynamic = "force-dynamic";

export default async function ContentSettingsPage() {
  const [ctx, connection, tuning, execs] = await Promise.all([
    getAccessContext(),
    getFbConnection(),
    getFbTuning(),
    listExecutives(),
  ]);
  const isAdmin = ctx?.isAdmin ?? false;

  const n8nConfigured = !!process.env.N8N_BASE_URL && !!process.env.N8N_WEBHOOK_SECRET;
  const groupUrl =
    process.env.FB_GROUP_URL ?? process.env.NEXT_PUBLIC_FB_GROUP_URL ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
      <FbConnectionCard connection={connection} isAdmin={isAdmin} />

      <TuningCard tuning={tuning} isAdmin={isAdmin} />

      <Card>
        <CardHeader>
          <CardTitle>Approvers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-500">
            Approve / reject / mark-posted is limited to the people flagged as approvers.
            Manage <strong>Admin</strong> and <strong>Approver</strong> roles in{" "}
            <Link href="/settings" className="text-navy-700 hover:underline dark:text-sky-300">
              General Settings → Team &amp; Approvers
            </Link>
            .
          </p>
          <ul className="space-y-1.5 text-sm">
            {execs.map((e) => (
              <li key={e.id} className="flex items-center justify-between">
                <span>
                  {e.name} <span className="text-slate-400">· {e.email}</span>
                </span>
                <span className="flex gap-1">
                  {e.is_admin && <Badge tone="navy">Admin</Badge>}
                  {e.is_approver && <Badge tone="emerald">Approver</Badge>}
                </span>
              </li>
            ))}
            {execs.length === 0 && <li className="text-slate-400">No executives configured.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <Row label="n8n webhook">
              {n8nConfigured ? (
                <Badge tone="emerald" dot>
                  Configured
                </Badge>
              ) : (
                <Badge tone="amber" dot>
                  Not connected
                </Badge>
              )}
            </Row>
            <Row label="Facebook Group URL">
              {groupUrl ? (
                <a href={groupUrl} className="truncate text-navy-700 hover:underline dark:text-sky-300">
                  {groupUrl}
                </a>
              ) : (
                <span className="text-slate-400">Set FB_GROUP_URL</span>
              )}
            </Row>
            <Row label="GroupMe alerts">
              {process.env.GROUPME_BOT_ID ? (
                <Badge tone="emerald" dot>
                  Configured
                </Badge>
              ) : (
                <Badge tone="slate">Optional</Badge>
              )}
            </Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
