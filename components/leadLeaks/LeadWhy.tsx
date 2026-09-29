import { Badge, type BadgeTone } from "@/components/ui/Badge";

/**
 * The per-lead pieces of /lead-leaks.
 *
 * WhyCell — the reason label plus LP-MCP's plain-English "why" (asked for
 * 2026-09-29: "we need the reasoning", not just a label). The sentence comes
 * from `detail.why` (LP-MCP src/lead-leak-explain.js). It is always visible,
 * because on a phone nothing may work only on hover (CLAUDE.md).
 *
 * LeadSubLine — phone, source and LP id under the name on phones, where those
 * columns are hidden (the components/leads/LeadsTable.tsx pattern).
 */
export function WhyCell({ tone, label, why }: { tone: BadgeTone; label: string; why: string | null }) {
  return (
    <div className="min-w-[12rem] max-w-[32rem]">
      <Badge tone={tone}>{label}</Badge>
      {why && <p className="mt-1 break-words text-[11.5px] leading-snug text-slate-600 dark:text-slate-400">{why}</p>}
    </div>
  );
}

export function LeadSubLine({ phone, source, lpLeadId }: { phone: string; source: string; lpLeadId: string }) {
  return (
    <div className="mt-0.5 text-[11.5px] font-normal text-slate-500 md:hidden">
      <div className="whitespace-nowrap">{phone}</div>
      <div className="break-words">
        {source} · <span className="whitespace-nowrap font-mono">LP {lpLeadId}</span>
      </div>
    </div>
  );
}
