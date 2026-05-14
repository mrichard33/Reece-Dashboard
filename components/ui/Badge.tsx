import { cn } from "@/lib/utils";

export type BadgeTone =
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "navy"
  | "brick"
  | "sky";

const toneStyles: Record<BadgeTone, string> = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  amber:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  rose: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  slate:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  navy: "bg-navy-50 text-navy-800 ring-navy-200 dark:bg-navy-900 dark:text-navy-100 dark:ring-navy-700",
  brick:
    "bg-brick-50 text-brick-700 ring-brick-200 dark:bg-brick-900 dark:text-brick-100 dark:ring-brick-700",
  sky: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
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
            tone === "amber" && "bg-amber-500",
            tone === "rose" && "bg-rose-500",
            tone === "slate" && "bg-slate-400",
            tone === "navy" && "bg-navy-600",
            tone === "brick" && "bg-brick",
            tone === "sky" && "bg-sky-500",
          )}
        />
      )}
      {children}
    </span>
  );
}
