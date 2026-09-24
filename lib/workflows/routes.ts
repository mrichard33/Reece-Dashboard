/**
 * Funnel routes — how the Workflows page groups 260+ workflows so a person can
 * find one by where it sits in a lead's life, not by memorising codes.
 *
 * The registry's `stage_family` (E, S1, S2 …) is the source; a workflow with no
 * registry row falls back to its name's code prefix, then to "Other". Order
 * is the funnel order the route map draws left to right.
 */
export type RouteKey =
  | "intake"
  | "entry"
  | "reengage"
  | "indoctrination"
  | "positioning"
  | "booking"
  | "appointments"
  | "customer"
  | "objections"
  | "lifecycle"
  | "system"
  | "other";

export type RouteDef = { key: RouteKey; label: string; blurb: string; main: boolean };

/** Funnel order. `main` routes form the left-to-right strip on the route map. */
export const ROUTES: readonly RouteDef[] = [
  { key: "intake", label: "Intake", blurb: "Lead capture, LP sync and data plumbing (I.*)", main: true },
  { key: "entry", label: "Entry & routing", blurb: "E.0 router and the entry bridges (E.*)", main: true },
  { key: "reengage", label: "Re-engagement", blurb: "Bring old and quiet leads back (S1.*)", main: true },
  { key: "indoctrination", label: "Indoctrination", blurb: "Trust-building nurture (S2.*)", main: true },
  { key: "positioning", label: "Positioning", blurb: "Solution pitch and authority (S3.*)", main: true },
  { key: "booking", label: "Booking", blurb: "Conversion to an appointment (S4.*)", main: true },
  { key: "appointments", label: "Appointments", blurb: "Confirm, remind and rescue appointments (A.*)", main: true },
  { key: "customer", label: "Customer", blurb: "After the sale: onboarding, install, reviews (C.*)", main: true },
  { key: "objections", label: "Objections & support", blurb: "Objection handling and follow-up (O.*, F.*)", main: false },
  { key: "lifecycle", label: "Lifecycle & recycle", blurb: "Lost, deferred and long-term nurture (L.*, S5.*)", main: false },
  { key: "system", label: "Behind the scenes", blurb: "Utilities and infrastructure (B.*, U.*, EXT, legacy)", main: false },
  { key: "other", label: "Other / unregistered", blurb: "Workflows with no registry row", main: false },
];

const BY_FAMILY: Record<string, RouteKey> = {
  I: "intake",
  E: "entry",
  S1: "reengage",
  S2: "indoctrination",
  S3: "positioning",
  S4: "booking",
  A: "appointments",
  C: "customer",
  O: "objections",
  F: "objections",
  L: "lifecycle",
  S5: "lifecycle",
  B: "system",
  U: "system",
  EXT: "system",
  LEGACY: "system",
};

/** "S2.2" → "S2", "E.0" → "E", "I.LP-IN" → "I", "EXT.LG" → "EXT". */
export function familyOf(code: string | null | undefined): string | null {
  const m = /^([A-Z]+\d*)(?:\.|$)/i.exec((code ?? "").trim());
  return m?.[1] ? m[1].toUpperCase() : null;
}

export function routeFor(input: { stageFamily?: string | null; canonicalCode?: string | null; name?: string | null }): RouteKey {
  const fam = (input.stageFamily ?? "").toUpperCase() || familyOf(input.canonicalCode) || familyOf(input.name?.split(/\s/)[0]);
  if (!fam) return "other";
  return BY_FAMILY[fam] ?? "other";
}

export function routeDef(key: RouteKey): RouteDef {
  return ROUTES.find((r) => r.key === key) ?? ROUTES[ROUTES.length - 1]!;
}
