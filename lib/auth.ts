import { cache } from "react";
import { lpServer, lpService } from "@/lib/supabase/lp";
import type { DashboardUser } from "@/lib/supabase/types";

/**
 * Returns the authenticated session's email + role, or null if signed out
 * or not on the allowlist. Wrapped in React.cache so layouts and pages
 * sharing a request only pay one round-trip.
 *
 * Lookup is against the `dashboard_users` table in LP Supabase. Mark adds
 * emails there manually via SQL (see db/migrations/0001_dashboard_users.sql).
 */
export const getSessionUser = cache(async (): Promise<DashboardUser | null> => {
  const supabase = await lpServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  // Service-role lookup so we don't depend on RLS for the allowlist read.
  const svc = lpService();
  const { data, error: lookupError } = await svc
    .from("dashboard_users")
    .select("email, role, created_at")
    .eq("email", user.email)
    .maybeSingle<DashboardUser>();

  if (lookupError || !data) return null;
  return data;
});

/** Convenience: returns just the role, or null. */
export async function getRole(): Promise<"operator" | "team" | null> {
  const user = await getSessionUser();
  return user?.role ?? null;
}
