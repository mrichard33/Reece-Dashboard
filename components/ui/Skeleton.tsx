import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "shimmer rounded bg-slate-100 dark:bg-slate-800",
        className,
      )}
    />
  );
}
