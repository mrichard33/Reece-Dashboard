"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight tooltip. Hover-on-desktop, focus-on-keyboard.
 * For more complex needs (rich content, click-toggle), use InfoPopover instead.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // 2026-09-26: below sm the label wraps inside a viewport-capped width — a
  // centered nowrap label near a screen edge ran off a 375px phone.
  return (
    <span
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 whitespace-normal rounded-md sm:max-w-none sm:whitespace-nowrap bg-navy-900 px-2 py-1 text-xs text-white shadow-lg ring-1 ring-navy-800 dark:bg-slate-700 dark:ring-slate-600">
          {label}
        </span>
      )}
    </span>
  );
}
