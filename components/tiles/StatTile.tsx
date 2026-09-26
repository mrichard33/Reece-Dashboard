import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  delta,
  deltaTone = "slate",
  suffix,
  helpKey,
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "emerald" | "rose" | "amber" | "slate";
  suffix?: string;
  helpKey: string;
}) {
  const deltaColor = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
    slate: "text-slate-500 dark:text-slate-400",
  }[deltaTone];

  return (
    <Card className="min-w-0">
      <CardHeader>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <InfoPopover helpKey={helpKey} />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          {/* text-2xl + break-words below sm (2026-09-26): "$1,234,567" in a
              two-column phone grid ran out of the tile at text-3xl. */}
          <p className="tabular min-w-0 break-words font-display text-2xl font-semibold text-navy-900 sm:text-3xl dark:text-white">
            {value}
            {suffix && (
              <span className="text-base font-normal text-slate-500 dark:text-slate-400">
                {suffix}
              </span>
            )}
          </p>
        </div>
        {delta && (
          <p className={cn("mt-1 text-xs font-medium", deltaColor)}>{delta}</p>
        )}
      </CardContent>
    </Card>
  );
}
