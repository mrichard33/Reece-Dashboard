import type { ReactNode } from "react";
import { SC_DEFS } from "./glossary";

/**
 * Inline word with a dotted underline + plain-language tooltip. Pure CSS
 * (group-hover/group-focus) — no JS state. tabIndex=0 for keyboard access.
 * Looks the definition up from SC_DEFS by `k` (or the child text) unless `def`
 * is passed explicitly.
 */
export function Term({
  children,
  def,
  k,
}: {
  children: ReactNode;
  def?: string;
  k?: string;
}) {
  const key = (k ?? (typeof children === "string" ? children : "")).toLowerCase();
  const text = def ?? SC_DEFS[key] ?? "";
  if (!text) return <span>{children}</span>;
  return (
    <span
      tabIndex={0}
      className="group relative inline cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2 outline-none"
    >
      {children}
      <span className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-56 rounded-md bg-[#0C2340] px-3 py-2 text-[11.5px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  );
}
