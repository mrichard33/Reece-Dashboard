"use server";

import { revalidatePath } from "next/cache";
import { lpServer, lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import type { DashboardUser } from "@/lib/supabase/types";

/**
 * Dashboard-user (allowlist) management for the General Settings surface.
 *
 * A person needs TWO things to use the dashboard:
 *   1. a Supabase Auth identity (the actual login + password), and
 *   2. a `dashboard_users` row (the allowlist the sign-in action checks).
 *
 * Historically both were provisioned by hand (Supabase dashboard + raw SQL).
 * These actions do both in one step via the service-role client so an admin
 * never has to touch SQL or the Supabase console. Admin-gated to match the
 * rest of the settings hub.
 */

export type ActionResult = { ok: boolean; error?: string };

export type DashboardUserRow = DashboardUser & {
  /** Whether a Supabase Auth identity exists for this email. */
  hasAuthAccount: boolean;
  /** Last successful sign-in, or null (never signed in / no account). */
  lastSignInAt: string | null;
};

export type CreateUserInput = {
  email: string;
  role: "operator" | "team";
  /** "invite" emails a set-password link; "password" sets one directly. */
  method: "invite" | "password";
  /** Required (>= 8 chars) when method === "password". */
  password?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function refresh() {
  revalidatePath("/settings");
}

/** Look up a Supabase Auth user by email (case-insensitive). */
async function findAuthUser(
  svc: ReturnType<typeof lpService>,
  email: string,
): Promise<{ id: string; last_sign_in_at?: string | null } | null> {
  // The team is small; a single page covers it. Bump perPage if it ever grows.
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const match = data?.users.find((u) => u.email?.toLowerCase() === email);
  return match ? { id: match.id, last_sign_in_at: match.last_sign_in_at } : null;
}

/** Send Supabase's recovery ("set a password") email. Depends on the project's SMTP. */
async function sendSetupEmail(email: string): Promise<ActionResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { ok: false, error: "NEXT_PUBLIC_APP_URL is not set — can't build the reset link." };
  }
  const supabase = await lpServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?type=recovery`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * List the allowlist, enriched with Supabase Auth status so the UI can show who
 * still has no login (allowlisted but no auth identity) vs. who has never signed
 * in. Admin only.
 */
export async function listDashboardUsers(): Promise<DashboardUserRow[]> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return [];

  const svc = lpService();
  const { data: rows } = await svc
    .from("dashboard_users")
    .select("email, role, created_at")
    .order("created_at");

  const { data: authData } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const authByEmail = new Map(
    (authData?.users ?? [])
      .filter((u) => u.email)
      .map((u) => [u.email!.toLowerCase(), u]),
  );

  return ((rows as DashboardUser[]) ?? []).map((r) => {
    const auth = authByEmail.get(r.email.toLowerCase());
    return {
      ...r,
      hasAuthAccount: Boolean(auth),
      lastSignInAt: auth?.last_sign_in_at ?? null,
    };
  });
}

/**
 * Provision a dashboard user end-to-end: ensure the Supabase Auth identity
 * exists (creating it, auto-confirmed, if needed) and add/keep the allowlist
 * row with the chosen role. Either emails a set-password link ("invite") or
 * sets the password directly ("password") — the latter is the reliable path
 * when the project's SMTP isn't configured. Admin only.
 */
export async function createDashboardUser(input: CreateUserInput): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (input.role !== "operator" && input.role !== "team") {
    return { ok: false, error: "Role must be operator or team." };
  }
  const wantsPassword = input.method === "password";
  const password = input.password ?? "";
  if (wantsPassword && password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const svc = lpService();

  // 1. Ensure the auth identity exists.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(wantsPassword ? { password } : {}),
  });

  if (createErr) {
    // Most likely the auth user already exists — reuse it.
    const existing = await findAuthUser(svc, email);
    if (!existing) return { ok: false, error: createErr.message };
    if (wantsPassword) {
      const { error: updErr } = await svc.auth.admin.updateUserById(existing.id, { password });
      if (updErr) return { ok: false, error: updErr.message };
    }
  } else if (!created?.user) {
    return { ok: false, error: "Could not create the login account." };
  }

  // 2. Add / update the allowlist row (this is the gate sign-in checks).
  const { error: allowErr } = await svc
    .from("dashboard_users")
    .upsert({ email, role: input.role }, { onConflict: "email" });
  if (allowErr) return { ok: false, error: allowErr.message };

  // 3. If they should set their own password, send the link.
  if (!wantsPassword) {
    const sent = await sendSetupEmail(email);
    if (!sent.ok) return sent;
  }

  refresh();
  return { ok: true };
}

/** Change an allowlist row's role. Admin only; can't demote yourself. */
export async function setDashboardUserRole(
  email: string,
  role: "operator" | "team",
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const target = email.trim().toLowerCase();
  if (target === ctx.email.toLowerCase() && role !== "operator") {
    return { ok: false, error: "You can't change your own role." };
  }
  const { error } = await lpService()
    .from("dashboard_users")
    .update({ role })
    .eq("email", target);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/**
 * Revoke dashboard access by removing the allowlist row. The Supabase Auth
 * identity is left intact (delete it in Supabase if a full purge is wanted);
 * dropping the allowlist row alone is enough to lock the person out. Admin only;
 * can't remove yourself.
 */
export async function removeDashboardUser(email: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const target = email.trim().toLowerCase();
  if (target === ctx.email.toLowerCase()) {
    return { ok: false, error: "You can't remove your own access." };
  }
  const { error } = await lpService().from("dashboard_users").delete().eq("email", target);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Re-send the set-password email to an existing user. Admin only. */
export async function resendSetupEmail(email: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const sent = await sendSetupEmail(email.trim().toLowerCase());
  if (!sent.ok) return sent;
  refresh();
  return { ok: true };
}
