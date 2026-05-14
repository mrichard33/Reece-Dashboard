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
    <Card>
      <CardHeader>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <InfoPopover helpKey={helpKey} />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <p className="tabular font-display text-3xl font-semibold text-navy-900 dark:text-white">
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
