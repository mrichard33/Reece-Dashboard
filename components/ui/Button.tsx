import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-navy-800 text-white hover:bg-navy-700 focus:ring-navy-600 dark:bg-navy-700 dark:hover:bg-navy-600",
  secondary:
    "bg-white text-navy-800 border border-slate-300 hover:bg-slate-50 focus:ring-navy-600 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800",
  danger:
    "bg-brick text-white hover:bg-brick-dark focus:ring-brick dark:hover:bg-brick-600",
};

const sizeStyles: Record<Size, string> = {
  // 2026-09-26: `sm` is ~24px tall — too small to hit with a thumb. Phones get
  // a 32px floor; sm+ keeps the compact desktop size.
  sm: "min-h-8 px-2 py-1 text-xs sm:min-h-0",
  md: "px-3 py-1.5 text-sm",
  lg: "px-4 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
