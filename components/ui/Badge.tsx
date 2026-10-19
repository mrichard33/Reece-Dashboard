import { cn } from "@/lib/utils";

export type BadgeTone =
  | "emerald"
  | "mint"
  | "amber"
  | "rose"
  | "slate"
  | "navy"
  | "brick"
  | "sky";

const toneStyles: Record<BadgeTone, string> = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  mint:
    "bg-emerald-50/60 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-900/60",
  amber:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  rose: "bg-brick-50 text-brick-700 ring-brick-200 dark:bg-brick-950 dark:text-brick-300 dark:ring-brick-900",
  slate:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  navy: "bg-navy-50 text-navy-800 ring-navy-200 dark:bg-navy-900 dark:text-navy-100 dark:ring-navy-700",
  brick:
    "bg-brick-50 text-brick-700 ring-brick-200 dark:bg-brick-900 dark:text-brick-100 dark:ring-brick-700",
  sky: "bg-steel-50 text-steel-700 ring-steel-200 dark:bg-steel-950 dark:text-steel-300 dark:ring-steel-900",
};

export function Badge({
  tone = "slate",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneStyles[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "emerald" && "bg-emerald-500",
            tone === "mint" && "bg-emerald-300",
            tone === "amber" && "bg-amber-500",
            tone === "rose" && "bg-brick-500",
            tone === "slate" && "bg-slate-400",
            tone === "navy" && "bg-navy-600",
            tone === "brick" && "bg-brick",
            tone === "sky" && "bg-steel-500",
          )}
        />
      )}
      {children}
    </span>
  );
}
