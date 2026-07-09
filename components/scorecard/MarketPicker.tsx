import { Building2, Lock } from "lucide-react";

/**
 * Market scope picker. Phase 1 renders it PRESENT BUT LOCKED to All Markets
 * (= the REECE company roll-up) — the per-market snapshot writer and By-Market
 * table land in a later phase. The full market list is shown in the title
 * tooltip so the control communicates what's coming without being interactive.
 */

export const SCORECARD_MARKETS = [
  { code: "STPET_MKT", label: "St. Petersburg" },
  { code: "ORL_MKT", label: "Orlando" },
  { code: "FTMYR_MKT", label: "Fort Myers" },
  { code: "JAX_MKT", label: "Jacksonville" },
  { code: "SAR_MKT", label: "Sarasota" },
  { code: "FTLAU_MKT", label: "Fort Lauderdale" },
  { code: "LAKE_MKT", label: "Lakeland" },
] as const;

export function MarketPicker({ locked = true }: { locked?: boolean }) {
  const tooltip = locked
    ? `Market breakdown coming — ${SCORECARD_MARKETS.map((m) => m.label).join(", ")}`
    : undefined;

  return (
    <div
      title={tooltip}
      aria-disabled={locked}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 ${
        locked ? "cursor-not-allowed" : ""
      }`}
    >
      <Building2 size={13} className="text-slate-400" />
      <span>All Markets</span>
      {locked && <Lock size={11} className="text-slate-400" />}
    </div>
  );
}
