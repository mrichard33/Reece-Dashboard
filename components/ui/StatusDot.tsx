import { cn } from "@/lib/utils";

export type DotStatus = "healthy" | "warning" | "critical" | "neutral";

const colorMap: Record<DotStatus, { base: string; ping: string }> = {
  healthy: { base: "bg-emerald-500", ping: "bg-emerald-400" },
  warning: { base: "bg-amber-500", ping: "bg-amber-400" },
  critical: { base: "bg-rose-500", ping: "bg-rose-400" },
  neutral: { base: "bg-slate-400", ping: "bg-slate-300" },
};

export function StatusDot({
  status,
  className,
  animate = true,
}: {
  status: DotStatus;
  className?: string;
  animate?: boolean;
}) {
  const { base, ping } = colorMap[status];
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {animate && status !== "neutral" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            ping,
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", base)} />
    </span>
  );
}
