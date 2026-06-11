import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { StatusDot, type DotStatus } from "@/components/ui/StatusDot";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import type { McpErrorKind } from "@/lib/mcp/client";

/** The error shape threaded out of the query layer (subset of McpError). */
export type McpTileError = { error: string; kind?: McpErrorKind };

type Presentation = { dot: DotStatus; tone: BadgeTone; heading: string };

/**
 * Map an McpErrorKind to a dot color, badge tone, and short heading so every
 * surface (overview, issues, Connections panel) renders MCP failures the same
 * way — amber & actionable for auth, slate for unreachable, rose for real
 * tool/unknown errors. Exported so panels can reuse the mapping inline.
 */
export function mcpErrorPresentation(kind: McpErrorKind | undefined): Presentation {
  switch (kind) {
    case "auth":
      return { dot: "warning", tone: "amber", heading: "Auth failed" };
    case "unreachable":
      return { dot: "neutral", tone: "slate", heading: "Unreachable" };
    case "timeout":
      return { dot: "neutral", tone: "slate", heading: "Timed out" };
    case "tool":
      return { dot: "critical", tone: "rose", heading: "Tool error" };
    default:
      return { dot: "critical", tone: "rose", heading: "Error" };
  }
}

/**
 * A tile rendered in place of a healthy status tile when an MCP call fails.
 * The message is the actionable string the client already produced (e.g. "Set
 * HL_MCP_AUTH_TOKEN …"), never a raw streamable-HTTP transport dump.
 */
export function McpStatusTile({
  label,
  error,
  helpKey,
}: {
  label: string;
  error: McpTileError;
  helpKey?: string;
}) {
  const { dot, tone, heading } = mcpErrorPresentation(error.kind);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <StatusDot status={dot} animate={false} />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {label}
          </p>
        </div>
        {helpKey ? <InfoPopover helpKey={helpKey} /> : null}
      </CardHeader>
      <CardContent>
        <Badge tone={tone} dot>
          {heading}
        </Badge>
        <p className="mt-2 break-words text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
          {error.error}
        </p>
      </CardContent>
    </Card>
  );
}
