"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { lpService } from "@/lib/supabase/lp";
import { parseFilterState } from "@/lib/workflows/filters";

/**
 * Writes for the Workflows page's per-user preferences (LP Supabase,
 * db/migrations/0022). Same shape as lib/actions/users.ts: session check,
 * service-role write, revalidate, `{ ok, error? }`. Every row is scoped to
 * the signed-in email, lowercased, so one person can never touch another's.
 */
export type ActionResult = { ok: boolean; error?: string };

async function me(): Promise<string | null> {
  const user = await getSessionUser();
  return user ? user.email.toLowerCase() : null;
}

export async function toggleFavorite(ghlWorkflowId: string, on: boolean): Promise<ActionResult> {
  const email = await me();
  if (!email) return { ok: false, error: "Not signed in." };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(ghlWorkflowId)) return { ok: false, error: "Bad workflow id." };
  const sb = lpService();
  const { error } = on
    ? await sb.from("dashboard_workflow_favorites").upsert({ email, ghl_workflow_id: ghlWorkflowId }, { onConflict: "email,ghl_workflow_id" })
    : await sb.from("dashboard_workflow_favorites").delete().eq("email", email).eq("ghl_workflow_id", ghlWorkflowId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/workflows");
  return { ok: true };
}

export async function savePreset(name: string, filters: unknown): Promise<ActionResult & { id?: number }> {
  const email = await me();
  if (!email) return { ok: false, error: "Not signed in." };
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) return { ok: false, error: "Give the filter a name (1–60 characters)." };
  const parsed = parseFilterState(filters);
  if (!parsed) return { ok: false, error: "That filter could not be read." };
  const sb = lpService();
  const { data, error } = await sb
    .from("dashboard_workflow_presets")
    .upsert({ email, name: clean, filters: parsed, updated_at: new Date().toISOString() }, { onConflict: "email,name" })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/workflows");
  return { ok: true, id: (data as { id: number }).id };
}

export async function deletePreset(id: number): Promise<ActionResult> {
  const email = await me();
  if (!email) return { ok: false, error: "Not signed in." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Bad preset id." };
  const sb = lpService();
  const { error } = await sb.from("dashboard_workflow_presets").delete().eq("email", email).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/workflows");
  return { ok: true };
}
