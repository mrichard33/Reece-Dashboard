import { AlertCircle } from "lucide-react";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { Tooltip } from "@/components/ui/Tooltip";
import { getIssuesPageData } from "@/lib/queries/issues";
import type { McpErrorKind } from "@/lib/mcp/client";
import { absTime, relTime, usd } from "@/lib/utils";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const severityTone: Record<NonNullable<ClaudeKnownIssue["severity"]>, BadgeTone> = {
  low: "slate",
  medium: "amber",
  high: "rose",
  critical: "brick",
};

export default async function IssuesPage() {
  const user = await requireRole("operator");
  const data = await getIssuesPageData();

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Issues & Anomalies"
        subtitle="Open issues, contamination, namespace conflicts, drift, stuck contacts"
      />

      <div className="space-y-6 p-6">
        {/* 1. Open issues */}
        <Card>
          <CardHeader>
            <CardTitle>Open issues</CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone={data.openIssues.length > 0 ? "rose" : "emerald"}>
                {data.openIssues.length}
              </Badge>
              <InfoPopover helpKey="issues.openIssues" />
            </div>
          </CardHeader>
          <CardContent>
            {data.errors.openIssues && (
              <ErrBanner label="open issues" msg={data.errors.openIssues} />
            )}
            {data.openIssues.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No open issues. Nice.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.openIssues.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 py-2">
                    <Badge
                      tone={i.severity ? severityTone[i.severity] : "slate"}
                      dot
                      className="mt-0.5"
                    >
                      {i.severity ?? "unknown"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-navy-900 dark:text-slate-100">
                        {i.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Reported {relTime(i.reported_date)}
                        {i.category ? ` · ${i.category}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 2. Contamination */}
        <Card>
          <CardHeader>
            <CardTitle>Contamination violations</CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone={data.contamination.length > 0 ? "rose" : "emerald"}>
                {data.contamination.length}
              </Badge>
              <InfoPopover helpKey="issues.contamination" />
            </div>
          </CardHeader>
          <CardContent>
            {data.errors.contamination && (
              <ErrBanner
                label="contamination"
                msg={data.errors.contamination}
                kind={data.errorKinds.contamination}
              />
            )}
            {data.contamination.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No contamination violations detected.
              </p>
            ) : (
              <SimpleList
                items={data.contamination.map((c) => ({
                  title: c.workflow_name,
                  code: c.canonical_code,
                  body: `${c.violation} — ${c.detail}`,
                }))}
              />
            )}
          </CardContent>
        </Card>

        {/* 3. Namespace violations */}
        <Card>
          <CardHeader>
            <CardTitle>Namespace violations</CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone={data.namespaceViolations.length > 0 ? "rose" : "emerald"}>
                {data.namespaceViolations.length}
              </Badge>
              <InfoPopover helpKey="issues.namespace" />
            </div>
          </CardHeader>
          <CardContent>
            {data.errors.namespace && (
              <ErrBanner
                label="namespace check"
                msg={data.errors.namespace}
                kind={data.errorKinds.namespace}
              />
            )}
            {data.namespaceViolations.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No namespace conflicts detected.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.namespaceViolations.map((v) => (
                  <li key={`${v.contact_id}:${v.namespace}`} className="py-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="amber">{v.namespace}</Badge>
                      <span className="text-sm font-medium text-navy-900 dark:text-slate-100">
                        {v.contact_name ?? v.contact_id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {v.conflicting_tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 4. Drift */}
        <Card>
          <CardHeader>
            <CardTitle>Drift candidates</CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone={data.driftCandidates.length > 0 ? "amber" : "emerald"}>
                {data.driftCandidates.length}
              </Badge>
              <InfoPopover helpKey="issues.drift" />
            </div>
          </CardHeader>
          <CardContent>
            {data.errors.drift && (
              <ErrBanner
                label="drift check"
                msg={data.errors.drift}
                kind={data.errorKinds.drift}
              />
            )}
            {data.driftCandidates.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No drift candidates. LP and HL are in sync.
              </p>
            ) : (
              <SimpleList
                items={data.driftCandidates.map((d) => ({
                  title: d.name ?? d.contact_id.slice(0, 8),
                  code: d.reason,
                  body: `GHL: ${d.ghl_status ?? "—"} · LP: ${d.lp_status ?? "—"} · last LP activity ${relTime(d.last_lp_activity_at)}`,
                }))}
              />
            )}
          </CardContent>
        </Card>

        {/* 5. Stuck contacts */}
        <Card>
          <CardHeader>
            <CardTitle>Stuck contacts</CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone={data.stuckContacts.length > 0 ? "amber" : "emerald"}>
                {data.stuckContacts.length}
              </Badge>
              <InfoPopover helpKey="issues.stuck" />
            </div>
          </CardHeader>
          <CardContent>
            {data.errors.stuck && (
              <ErrBanner label="stuck contacts" msg={data.errors.stuck} />
            )}
            {data.stuckContacts.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No contacts stuck longer than 14 days.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-3">Opp</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Value</th>
                      <th className="py-2 pr-3">Last update</th>
                      <th className="py-2 pr-3">Days stuck</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.stuckContacts.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-3 text-navy-900 dark:text-slate-100">
                          {c.name ?? c.id.slice(0, 8)}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">
                          {c.source ?? "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono tabular text-slate-600">
                          {usd(c.monetaryValue)}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          <Tooltip label={absTime(c.updatedAt)}>
                            <span className="text-slate-500">
                              {relTime(c.updatedAt)}
                            </span>
                          </Tooltip>
                        </td>
                        <td className="py-2 pr-3 font-semibold">
                          <Badge
                            tone={c.daysStuck > 30 ? "rose" : "amber"}
                          >{`${c.daysStuck}d`}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ErrBanner({
  label,
  msg,
  kind,
}: {
  label: string;
  msg: string;
  kind?: McpErrorKind;
}) {
  // For an MCP auth/reachability failure the message is already actionable
  // (e.g. "Set HL_MCP_AUTH_TOKEN …") — lead with the diagnosis, not a generic
  // "check failed". Unreachable/timeout read slate; everything else amber.
  const heading =
    kind === "auth"
      ? "Auth failed:"
      : kind === "unreachable" || kind === "timeout"
        ? "MCP unreachable:"
        : `${label} check failed:`;
  const slate = kind === "unreachable" || kind === "timeout";
  const cls = slate
    ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100";
  return (
    <div className={`mb-3 flex items-start gap-2 rounded border px-3 py-2 text-xs ${cls}`}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div>
        <strong>{heading}</strong> {msg}
      </div>
    </div>
  );
}

function SimpleList({
  items,
}: {
  items: Array<{ title: string; code: string | null; body: string }>;
}) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((i, idx) => (
        <li key={idx} className="py-2">
          <div className="flex items-center gap-2">
            {i.code && (
              <Badge tone="navy">
                <span className="font-mono">{i.code}</span>
              </Badge>
            )}
            <span className="text-sm font-medium text-navy-900 dark:text-slate-100">
              {i.title}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{i.body}</p>
        </li>
      ))}
    </ul>
  );
}
