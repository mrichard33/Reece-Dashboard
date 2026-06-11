"use server";

import { revalidatePath } from "next/cache";
import { lpServer, lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";

export type ActionResult = { ok: boolean; error?: string };

export type FbConnectionStatus = {
  configured: boolean; // page id + token both present
  enabled: boolean; // auto_publish_enabled
  pageId: string | null;
  pageName: string | null;
  graphVersion: string;
  tokenLast4: string | null; // display hint only
  tokenUpdatedAt: string | null;
};

const FB_TOKEN_KEY = "fb_page_access_token";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/content", "layout");
}

/** Read connection state for the Settings page. NEVER returns the token. */
export async function getFbConnection(): Promise<FbConnectionStatus | null> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return null;

  const supabase = await lpServer();
  const { data } = await supabase.from("fb_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return null;
  const s = data as Record<string, unknown>;

  // Token presence check via service role (value never leaves the server).
  const { data: secret } = await lpService()
    .from("fb_secrets")
    .select("key")
    .eq("key", FB_TOKEN_KEY)
    .maybeSingle();

  return {
    configured: Boolean(s.fb_page_id) && Boolean(secret),
    enabled: Boolean(s.auto_publish_enabled),
    pageId: (s.fb_page_id as string) ?? null,
    pageName: (s.fb_page_name as string) ?? null,
    graphVersion: (s.fb_graph_version as string) ?? "v23.0",
    tokenLast4: (s.token_last4 as string) ?? null,
    tokenUpdatedAt: (s.token_updated_at as string) ?? null,
  };
}

/** Save non-secret connection fields. Admin only (RLS also enforces). */
export async function saveFbSettings(fields: {
  fb_page_id?: string;
  fb_graph_version?: string;
}): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const update: Record<string, unknown> = {
    updated_by: ctx.executive?.name ?? ctx.email,
    updated_at: new Date().toISOString(),
  };
  if (fields.fb_page_id !== undefined) update.fb_page_id = fields.fb_page_id.trim() || null;
  if (fields.fb_graph_version !== undefined) {
    const v = fields.fb_graph_version.trim();
    if (v && !/^v\d+\.\d+$/.test(v)) return { ok: false, error: "Graph version must look like v23.0." };
    update.fb_graph_version = v || "v23.0";
  }

  const supabase = await lpServer();
  const { error } = await supabase.from("fb_settings").update(update).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Write-only token save. Stores via service role; settings row gets a last-4 hint. */
export async function saveFbToken(token: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const t = token.trim();
  if (t.length < 30) return { ok: false, error: "That doesn't look like a Page access token." };

  const by = ctx.executive?.name ?? ctx.email;
  const svc = lpService();
  const { error } = await svc.from("fb_secrets").upsert({
    key: FB_TOKEN_KEY,
    value: t,
    updated_by: by,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  await svc
    .from("fb_settings")
    .update({
      token_last4: t.slice(-4),
      token_updated_at: new Date().toISOString(),
      updated_by: by,
    })
    .eq("id", 1);

  refresh();
  return { ok: true };
}

/** Live Graph API check: confirms page id + token together. Snapshots the page name. */
export async function testFbConnection(): Promise<ActionResult & { pageName?: string }> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const svc = lpService();
  const [{ data: settings }, { data: secret }] = await Promise.all([
    svc.from("fb_settings").select("fb_page_id, fb_graph_version").eq("id", 1).maybeSingle(),
    svc.from("fb_secrets").select("value").eq("key", FB_TOKEN_KEY).maybeSingle(),
  ]);

  const pageId = (settings as { fb_page_id?: string } | null)?.fb_page_id;
  const version = (settings as { fb_graph_version?: string } | null)?.fb_graph_version ?? "v23.0";
  const token = (secret as { value?: string } | null)?.value;
  if (!pageId || !token) return { ok: false, error: "Set the Page ID and token first." };

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, error: body?.error?.message ?? `Graph API responded ${res.status}` };
    }
    await svc.from("fb_settings").update({ fb_page_name: body.name }).eq("id", 1);
    refresh();
    return { ok: true, pageName: body.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection test failed." };
  }
}

/** Master kill switch for WF4. */
export async function setAutoPublish(enabled: boolean): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  if (enabled) {
    const status = await getFbConnection();
    if (!status?.configured)
      return { ok: false, error: "Connect the Page (ID + token) before enabling auto-publish." };
  }

  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_settings")
    .update({
      auto_publish_enabled: enabled,
      updated_by: ctx.executive?.name ?? ctx.email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
