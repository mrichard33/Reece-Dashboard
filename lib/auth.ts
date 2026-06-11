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

export type ExecutiveContext = {
  email: string;
  role: "operator" | "team";
  /** The caller's executives row, or null if they're not an executive. */
  executive: { id: string; name: string; is_admin: boolean } | null;
  isExecutive: boolean;
  /** executives.is_admin — Exec-Review admin powers (create/submit/set-required). */
  isAdmin: boolean;
  /** Executive but not a dashboard operator — confined to /approvals. */
  isExecOnly: boolean;
};

/**
 * Resolves the caller's dashboard role AND their Executive Review membership.
 * Executive identity is keyed on auth.uid() (user_id), matching the DB's
 * current_executive_id()/is_admin() functions so the UI and server enforcement
 * agree on who someone is. Returns null when signed out / off the allowlist.
 */
export const getAccessContext = cache(async (): Promise<ExecutiveContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await lpServer();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let executive: ExecutiveContext["executive"] = null;
  if (authUser?.id) {
    // RLS exec_read lets any authenticated user read the roster. A missing
    // executives table (pre-migration) returns an error, treated as "not an exec".
    const { data } = await supabase
      .from("executives")
      .select("id, name, is_admin")
      .eq("user_id", authUser.id)
      .eq("active", true)
      .maybeSingle();
    if (data) {
      executive = { id: data.id, name: data.name, is_admin: data.is_admin };
    }
  }

  const isExecutive = executive !== null;
  return {
    email: user.email,
    role: user.role,
    executive,
    isExecutive,
    isAdmin: executive?.is_admin ?? false,
    isExecOnly: isExecutive && user.role !== "operator",
  };
});

/**
 * Approver allowlist for content approve/reject/publish (spec §1, §9).
 * Comma-separated `APPROVER_EMAILS`. This is an app-layer gate layered ON TOP of
 * the executive-based RLS that the DB still enforces — so an approver must also be
 * an executive for the write to land. If the env is unset/empty we fall back to
 * executive-only gating (don't break a working deploy with an empty list).
 */
export function approverEmails(): string[] {
  return (process.env.APPROVER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether an email may approve/reject/publish content. Resolution order
 * (documented in /settings → Team and .env.example):
 *   1. If any active executive is flagged is_approver (db/migrations/0007),
 *      the DB flags are authoritative — only flagged emails approve.
 *   2. Else APPROVER_EMAILS env (legacy fallback).
 *   3. Else any executive (defer to the executive-only RLS gate).
 * Wrapped in React.cache so the roster read is shared within a request. Reads
 * via service role (no RLS dependency) and degrades to env gating if the
 * is_approver column doesn't exist yet (pre-0007) or the read fails.
 */
export const isApprover = cache(
  async (email: string | null | undefined): Promise<boolean> => {
    try {
      const svc = lpService();
      const { data, error } = await svc
        .from("executives")
        .select("email, is_approver")
        .eq("active", true);
      if (!error && data) {
        const flagged = (data as Array<{ email: string | null; is_approver?: boolean }>).filter(
          (r) => r.is_approver,
        );
        if (flagged.length > 0) {
          return (
            !!email &&
            flagged.some((r) => r.email?.toLowerCase() === email.toLowerCase())
          );
        }
      }
    } catch {
      // fall through to env-based gating (pre-0007 schema / read failure)
    }
    const list = approverEmails();
    if (list.length === 0) return true; // unset → defer to the executive gate
    return !!email && list.includes(email.toLowerCase());
  },
);
