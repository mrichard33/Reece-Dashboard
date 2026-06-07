import { listExecutives } from "@/lib/queries/approvals";
import { approverEmails } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function ContentSettingsPage() {
  const execs = await listExecutives();
  const approverList = approverEmails();
  const n8nConfigured = !!process.env.N8N_BASE_URL && !!process.env.N8N_WEBHOOK_SECRET;
  const groupUrl =
    process.env.FB_GROUP_URL ?? process.env.NEXT_PUBLIC_FB_GROUP_URL ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Approvers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-500">
            Approve / reject / mark-posted is limited to{" "}
            {approverList.length > 0
              ? "executives whose email is also in APPROVER_EMAILS"
              : "anyone on the Executive Review roster (APPROVER_EMAILS unset)"}
            . Manage the roster in the LP Supabase `executives` table.
          </p>
          <ul className="space-y-1.5 text-sm">
            {execs.map((e) => (
              <li key={e.id} className="flex items-center justify-between">
                <span>
                  {e.name} <span className="text-slate-400">· {e.email}</span>
                </span>
                {e.is_admin && <Badge tone="navy">Admin</Badge>}
              </li>
            ))}
            {execs.length === 0 && <li className="text-slate-400">No executives configured.</li>}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            APPROVER_EMAILS:{" "}
            {approverList.length > 0
              ? `${approverList.length} listed`
              : "unset (executive-only gating)"}
          </p>
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
          <p className="mt-4 text-xs text-slate-500">
            Generation cadence, post time, the Anthropic model, the image provider, and the
            Meta Page token live in n8n (see <code>n8n/README.md</code>), not the dashboard.
          </p>
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
