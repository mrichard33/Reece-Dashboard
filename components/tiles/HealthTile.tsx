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
  helpKey,
}: {
  label: string;
  status: DotStatus;
  detail?: string;
  lastActivity?: Date | string | null;
  helpKey: string;
}) {
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
