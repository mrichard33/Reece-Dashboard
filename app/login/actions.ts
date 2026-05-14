"use server";

import { redirect } from "next/navigation";
import { lpServer, lpService } from "@/lib/supabase/lp";

export type ActionState = {
  error?: string;
  success?: boolean;
};

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await lpServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const svc = lpService();
  const { data: allowlistRow } = await svc
    .from("dashboard_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!allowlistRow) {
    await supabase.auth.signOut();
    return { error: "Account not authorized. Contact the system administrator." };
  }

  redirect("/overview");
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { error: "Email is required." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { error: "Server misconfigured. Contact the system administrator." };
  }
  const supabase = await lpServer();

  // Always return success to avoid leaking which emails exist.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?type=recovery`,
  });

  return { success: true };
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await lpServer();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/overview");
}
