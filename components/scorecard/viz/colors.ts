// Flat chart-fill constants for the scorecard visuals. On-brand: navy primary,
// status colors for meaning, no gradients. Mirrors SC_COLOR from the handoff.
export const SC_COLOR = {
  navy: "#0C2340",
  navy600: "#274560",
  emerald: "#059669",
  amber: "#D97706",
  rose: "#E11D48",
  brick: "#ED1E24",
  sky: "#0284C7",
  slate: "#94A3B8",
  slate300: "#CBD5E1",
} as const;

export type RevenueTone = "navy" | "amber" | "sky" | "slate";

export const SC_TONE_FILL: Record<RevenueTone, string> = {
  navy: SC_COLOR.navy,
  amber: SC_COLOR.amber,
  sky: SC_COLOR.sky,
  slate: SC_COLOR.slate,
};
