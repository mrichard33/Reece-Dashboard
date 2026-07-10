/**
 * Scorecard market codes + label helper — a plain module (NOT "use client") so both
 * the server scorecard page and the client MarketPicker/GoalEditor can import it.
 * These previously lived in MarketPicker.tsx, but that file is "use client", which
 * turned `marketLabel` into a client reference and made calling it from the server
 * page throw ("Attempted to call marketLabel() from the server"). The 7 codes map to
 * the per-market snapshot rows written by the LP-MCP per-market writer.
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

export function marketLabel(code: string | null | undefined): string {
  if (!code || code === "REECE") return "All Markets";
  return SCORECARD_MARKETS.find((m) => m.code === code)?.label ?? code;
}
