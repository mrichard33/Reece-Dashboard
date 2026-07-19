"use server";

import { revalidatePath } from "next/cache";
import { lpServer, lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { lpMcp } from "@/lib/mcp/lpClient";
import { hlMcp, type N8nWorkflowSummary } from "@/lib/mcp/hlClient";
import { McpError, type McpErrorKind } from "@/lib/mcp/client";
import { pingGroupMe } from "@/lib/notify/groupme";

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

/**
 * Read connection state for the settings surfaces. NEVER returns the token.
 * Available to any authenticated user (Content Settings shows it read-only to
 * non-admins); edits stay admin-gated in the individual save actions.
 */
export async function getFbConnection(): Promise<FbConnectionStatus | null> {
  const ctx = await getAccessContext();
  if (!ctx) return null;

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

/**
 * Generation-tuning save (Content Settings). Admin only (RLS also enforces).
 * Each numeric field accepts a value, or null to clear it back to the env/default
 * fallback. Ranges mirror the CHECK constraints in 0007_settings_controls.sql
 * and 0011/0014 (video_share / mascot_frequency / text_share, 0–100).
 */
const TUNING_RANGES = {
  max_regen_attempts: [1, 10],
  max_per_generation: [1, 20],
  plan_horizon_days: [1, 90],
  generation_buffer_days: [1, 30],
  video_share: [0, 100],
  mascot_frequency: [0, 100],
  text_share: [0, 100],
} as const;

export async function saveFbTuning(input: {
  default_post_time?: string | null;
  max_regen_attempts?: number | null;
  max_per_generation?: number | null;
  plan_horizon_days?: number | null;
  generation_buffer_days?: number | null;
  video_share?: number | null;
  mascot_frequency?: number | null;
  text_share?: number | null;
}): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  const update: Record<string, unknown> = {
    updated_by: ctx.executive?.name ?? ctx.email,
    updated_at: new Date().toISOString(),
  };

  for (const key of Object.keys(TUNING_RANGES) as (keyof typeof TUNING_RANGES)[]) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null || v === undefined) {
      update[key] = null; // clear → fall back to env/default
      continue;
    }
    const [lo, hi] = TUNING_RANGES[key];
    if (!Number.isInteger(v) || v < lo || v > hi) {
      return { ok: false, error: `${key} must be a whole number between ${lo} and ${hi}.` };
    }
    update[key] = v;
  }

  if ("default_post_time" in input) {
    const t = input.default_post_time;
    if (t === null || t === undefined || t.trim() === "") {
      update.default_post_time = null;
    } else if (!/^\d{2}:\d{2}(:\d{2})?$/.test(t.trim())) {
      return { ok: false, error: "Default post time must look like 09:00." };
    } else {
      update.default_post_time = t.trim();
    }
  }

  const supabase = await lpServer();
  const { error } = await supabase.from("fb_settings").update(update).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
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

// ── General Settings: Connections panel ──────────────────────────

export type McpPing =
  | { ok: true }
  | { ok: false; kind: McpErrorKind; message: string };

/** Uncached liveness probe for a MCP service (cheapest tool). Admin only. */
export async function pingMcp(service: "lp" | "hl"): Promise<McpPing> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, kind: "unknown", message: "Admin only." };
  try {
    await (service === "lp" ? lpMcp.ping() : hlMcp.ping());
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      kind: e instanceof McpError ? e.kind : "unknown",
      message: e instanceof Error ? e.message : "Ping failed.",
    };
  }
}

/** Trigger a full sync via the MCP service; returns the per-entity result. */
export async function triggerMcpSync(
  service: "lp" | "hl",
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  try {
    const result = await (service === "lp" ? lpMcp.triggerSync() : hlMcp.triggerSync());
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
  }
}

/**
 * Ask the LP decision engine to reload its rules. Surfaces the response body
 * verbatim. If the endpoint rejects unauthenticated POSTs, that surfaces too —
 * wiring a token for it is a follow-up.
 */
export async function reloadDecisionEngine(): Promise<{
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const base = process.env.LP_MCP_URL;
  if (!base) return { ok: false, error: "LP_MCP_URL is not set on the dashboard." };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/n8n/decision-engine/reload-rules`, {
      method: "POST",
      cache: "no-store",
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." };
  }
}

// ── General Settings: Automation Controls (FB · workflows only) ───

/** Only FB-content-engine workflows are exposed here, by name prefix. */
const FB_WORKFLOW_PREFIX = "FB ·";

export type FbWorkflowRow = {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number | null;
};

export type FbWorkflowsResult =
  | { ok: true; workflows: FbWorkflowRow[] }
  | { ok: false; kind: McpErrorKind; message: string };

function normalizeWorkflows(
  raw: { workflows?: N8nWorkflowSummary[] } | N8nWorkflowSummary[],
): N8nWorkflowSummary[] {
  return Array.isArray(raw) ? raw : raw.workflows ?? [];
}

/** List only the `FB ·` workflows (hard filter — GHL/agentic ones are hidden). */
export async function listFbWorkflows(): Promise<FbWorkflowsResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, kind: "unknown", message: "Admin only." };
  try {
    const all = normalizeWorkflows(await hlMcp.listWorkflows());
    const workflows = all
      .filter((w) => typeof w?.name === "string" && w.name.startsWith(FB_WORKFLOW_PREFIX))
      .map((w) => ({
        id: String(w.id),
        name: w.name,
        active: Boolean(w.active),
        nodeCount:
          typeof w.nodeCount === "number"
            ? w.nodeCount
            : Array.isArray(w.nodes)
              ? w.nodes.length
              : null,
      }));
    return { ok: true, workflows };
  } catch (e) {
    return {
      ok: false,
      kind: e instanceof McpError ? e.kind : "unknown",
      message: e instanceof Error ? e.message : "Failed to list workflows.",
    };
  }
}

/**
 * Activate / deactivate a single FB · workflow. Re-fetches the roster to prove
 * the id maps to an FB · workflow before flipping it — this action must never
 * touch a GHL/agentic workflow even if handed an arbitrary id. Pings GroupMe
 * with the acting user (not a hardcoded name) for the audit trail.
 */
export async function toggleFbWorkflow(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  let name: string | null = null;
  try {
    const all = normalizeWorkflows(await hlMcp.listWorkflows());
    const wf = all.find((w) => String(w?.id) === id);
    name = typeof wf?.name === "string" ? wf.name : null;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not verify workflow." };
  }
  if (!name || !name.startsWith(FB_WORKFLOW_PREFIX)) {
    return { ok: false, error: "Only FB · workflows can be toggled here." };
  }

  try {
    await hlMcp.setWorkflowActive(id, active);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Toggle failed." };
  }

  const actor = ctx.executive?.name ?? ctx.email;
  await pingGroupMe(
    `${actor} ${active ? "activated" : "deactivated"} ${name} from the dashboard.`,
  );
  revalidatePath("/settings");
  return { ok: true };
}

// ── General Settings: Team & Approvers ───────────────────────────

/**
 * Set an executive's Admin / Approver flags. Admin only. An admin cannot strip
 * their own is_admin (prevents lockout). Writes via service role — the
 * executives table has no authenticated write policy (0002).
 */
export async function setExecutiveRoles(
  id: string,
  roles: { is_admin?: boolean; is_approver?: boolean },
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };

  if (roles.is_admin === false && ctx.executive?.id === id) {
    return { ok: false, error: "You can't remove your own admin role." };
  }

  const update: Record<string, unknown> = {};
  if (roles.is_admin !== undefined) update.is_admin = roles.is_admin;
  if (roles.is_approver !== undefined) update.is_approver = roles.is_approver;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await lpService().from("executives").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/content", "layout");
  return { ok: true };
}
