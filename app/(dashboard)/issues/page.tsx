import { AlertCircle } from "lucide-react";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { FileIssueButton } from "@/components/issues/FileIssueButton";
import { getIssuesPageData } from "@/lib/queries/issues";
import type { McpErrorKind } from "@/lib/mcp/client";
import { relTime } from "@/lib/utils";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Severity → Badge tone. Faithful to the design (high→rose, med→amber, else
// slate) but keeps `critical` from dimming to slate by folding it into rose.
const sevTone = (s: ClaudeKnownIssue["severity"]): BadgeTone =>
  s === "high" || s === "critical" ? "rose" : s === "medium" ? "amber" : "slate";

export default async function IssuesPage() {
  const user = await requireRole("operator");
  const data = await getIssuesPageData();

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Issues"
        subtitle="Open issues, contamination violations, data drift, and stuck contacts."
        actions={<FileIssueButton />}
      />

      <div className="space-y-6 p-6">
        {/* 1. Open issues */}
        <IssueTableCard
          title="Open issues"
          helpKey="issues.openIssues"
          badge={{ tone: "rose", label: `${data.openIssues.length} open` }}
          error={
            data.errors.openIssues ? (
              <ErrBanner label="open issues" msg={data.errors.openIssues} />
            ) : undefined
          }
        >
          {data.openIssues.length === 0 ? (
            <Empty>No open issues. Nice.</Empty>
          ) : (
            <Table head={["Severity", "Issue", "Opened", "Workflow"]}>
              {data.openIssues.map((i) => (
                <tr key={i.id} className={rowClass}>
                  <td className={cellClass}>
                    <Badge tone={sevTone(i.severity)}>
                      {i.severity ?? "unknown"}
                    </Badge>
                  </td>
                  <td className={`${cellClass} text-slate-800 dark:text-slate-200`}>
                    {i.description}
                  </td>
                  <td className={`${cellClass} text-slate-500 tabular`}>
                    {relTime(i.reported_date)}
                  </td>
                  <td className={`${cellClass} font-mono text-slate-500`}>
                    {i.workflow_name ?? "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </IssueTableCard>

        {/* 2. Contamination violations */}
        <IssueTableCard
          title="Contamination violations"
          helpKey="issues.contamination"
          error={
            data.errors.contamination ? (
              <ErrBanner
                label="contamination"
                msg={data.errors.contamination}
                kind={data.errorKinds.contamination}
              />
            ) : undefined
          }
        >
          {data.contamination.length === 0 ? (
            <Empty>No contamination violations detected.</Empty>
          ) : (
            <Table head={["Workflow", "Violation", "Recommended fix"]}>
              {data.contamination.map((c, idx) => (
                <tr key={`${c.workflow_name}:${idx}`} className={rowClass}>
                  <td className={`${cellClass} font-mono text-slate-700 dark:text-slate-200`}>
                    {c.canonical_code ?? c.workflow_name}
                  </td>
                  <td className={`${cellClass} text-slate-700 dark:text-slate-300`}>
                    {c.violation}
                  </td>
                  <td className={`${cellClass} text-slate-500`}>{c.detail}</td>
                </tr>
              ))}
            </Table>
          )}
        </IssueTableCard>

        {/* 3. Namespace violations */}
        <IssueTableCard
          title="Namespace violations"
          helpKey="issues.namespace"
          badge={{
            tone: "amber",
            label: `${data.namespaceViolations.length} contacts`,
          }}
          error={
            data.errors.namespace ? (
              <ErrBanner
                label="namespace check"
                msg={data.errors.namespace}
                kind={data.errorKinds.namespace}
              />
            ) : undefined
          }
        >
          {data.namespaceViolations.length === 0 ? (
            <Empty>No namespace conflicts detected.</Empty>
          ) : (
            <Table head={["Contact", "Conflicting tags"]}>
              {data.namespaceViolations.map((v) => (
                <tr key={`${v.contact_id}:${v.namespace}`} className={rowClass}>
                  <td className={`${cellClass} font-mono text-slate-700 dark:text-slate-200`}>
                    {v.contact_name ?? v.contact_id}
                  </td>
                  <td className={`${cellClass} text-slate-700 dark:text-slate-300`}>
                    {v.conflicting_tags.join(" ⨯ ")}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </IssueTableCard>

        {/* 4. Drift candidates */}
        <IssueTableCard
          title="Drift candidates"
          helpKey="issues.drift"
          error={
            data.errors.drift ? (
              <ErrBanner
                label="drift check"
                msg={data.errors.drift}
                kind={data.errorKinds.drift}
              />
            ) : undefined
          }
        >
          {data.driftCandidates.length === 0 ? (
            <Empty>No drift candidates. LP and HL are in sync.</Empty>
          ) : (
            <Table head={["Name", "GHL state", "LP state"]}>
              {data.driftCandidates.map((d) => (
                <tr key={d.contact_id} className={rowClass}>
                  <td className={`${cellClass} text-slate-800 dark:text-slate-200`}>
                    {d.name ?? d.contact_id}
                  </td>
                  <td className={cellClass}>
                    <Badge tone="slate">{d.ghl_status ?? "—"}</Badge>
                  </td>
                  <td className={cellClass}>
                    <Badge tone="amber">{d.lp_status ?? "—"}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </IssueTableCard>

        {/* 5. Stuck contacts */}
        <IssueTableCard
          title="Stuck contacts"
          helpKey="issues.stuck"
          badge={{ tone: "rose", label: `${data.stuckContacts.length} stuck` }}
          error={
            data.errors.stuck ? (
              <ErrBanner label="stuck contacts" msg={data.errors.stuck} />
            ) : undefined
          }
        >
          {data.stuckContacts.length === 0 ? (
            <Empty>No contacts stuck longer than 14 days.</Empty>
          ) : (
            <Table head={["Name", "Stage", "Days in stage", "Last activity"]}>
              {data.stuckContacts.map((c) => (
                <tr key={c.id} className={rowClass}>
                  <td className={`${cellClass} text-slate-800 dark:text-slate-200`}>
                    {c.name ?? c.id}
                  </td>
                  <td className={cellClass}>
                    <Badge tone="slate">{c.stageName ?? c.stageId ?? "—"}</Badge>
                  </td>
                  <td className={`${cellClass} tabular`}>
                    <span
                      className={`font-mono ${
                        c.daysStuck > 30
                          ? "text-rose-600 font-semibold"
                          : c.daysStuck > 14
                            ? "text-amber-600"
                            : "text-slate-600"
                      }`}
                    >
                      {c.daysStuck}d
                    </span>
                  </td>
                  <td className={`${cellClass} text-slate-500`}>
                    {relTime(c.updatedAt)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </IssueTableCard>
      </div>
    </>
  );
}

// ── Shared table-card presentation ───────────────────────────────────────────

const rowClass = "hover:bg-slate-50 dark:hover:bg-slate-800/50";
const cellClass = "py-2 pr-3";

/** A Card wrapping one full-width table: 13px title + InfoPopover, optional
 *  right-aligned count Badge, per-section error banner, then the table body. */
function IssueTableCard({
  title,
  helpKey,
  badge,
  error,
  children,
}: {
  title: string;
  helpKey: string;
  badge?: { tone: BadgeTone; label: string } | null;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
            {title}
          </h3>
          <InfoPopover helpKey={helpKey} align="left" />
        </div>
        {badge && (
          <div className="shrink-0">
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error}
        {children}
      </CardContent>
    </Card>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            {head.map((h) => (
              <th key={h} className="pb-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-center text-sm text-slate-500">{children}</p>
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
