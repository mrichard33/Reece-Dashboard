import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { StatusDot, type DotStatus } from "@/components/ui/StatusDot";
import { InfoPopover } from "@/components/help/InfoPopover";
import { Tooltip } from "@/components/ui/Tooltip";
import { absTime, relTime } from "@/lib/utils";

export function HealthTile({
  label,
  status,
  detail,
  lastActivity,
  lastError,
  helpKey,
}: {
  label: string;
  status: DotStatus;
  detail?: string;
  lastActivity?: Date | string | null;
  /** When the underlying MCP/Supabase call failed, render the error in place
   * of "Status unavailable" so operators have a real diagnosis. */
  lastError?: string | null;
  helpKey: string;
}) {
  const hasError = typeof lastError === "string" && lastError.length > 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {label}
          </p>
        </div>
        <InfoPopover helpKey={helpKey} />
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium text-navy-900 dark:text-white">
          {detail ?? "—"}
        </p>
        {hasError && (
          <p className="mt-1 break-words text-[11px] text-rose-600 dark:text-rose-400">
            {lastError}
          </p>
        )}
        {lastActivity !== undefined && (
          <Tooltip label={absTime(lastActivity)}>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {relTime(lastActivity)}
            </p>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
}
