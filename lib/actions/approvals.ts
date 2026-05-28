"use server";

import { revalidatePath } from "next/cache";
import { lpServer } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { uploadAssetFile, removeAssetFile, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { pingGroupMe } from "@/lib/notify/groupme";
import { sendApprovalRequestEmail } from "@/lib/notify/email";
import type { AssetType, MediaType, ActivityCategory } from "@/lib/supabase/types";

export type ActionResult = { ok: boolean; error?: string; assetId?: string };

type NewAttachment = {
  kind: "file" | "link" | "text";
  label: string;
  media_type?: MediaType | null;
  external_url?: string | null;
  inline_text?: string | null;
  fileKey?: string;
};

const ASSET_TYPES: AssetType[] = [
  "script",
  "audio",
  "video",
  "framework",
  "transcript",
  "system_change",
  "other",
];

// ── Decisions ────────────────────────────────────────────────────

export async function castDecision(
  assetId: string,
  decision: "approved" | "rejected",
  reason: string,
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Not an executive." };
  if (decision === "rejected" && !reason.trim()) {
    return { ok: false, error: "A rejection requires a reason." };
  }

  const supabase = await lpServer();
  const { error } = await supabase
    .from("asset_approvals")
    .update({
      decision,
      reason: decision === "rejected" ? reason.trim() : null,
    })
    .eq("asset_id", assetId)
    .eq("executive_id", ctx.executive.id);
  if (error) return { ok: false, error: error.message };

  // Push leg of the notification: ping Mark on GroupMe (the in-app row is
  // written by the recompute trigger).
  const { data: asset } = await supabase
    .from("assets")
    .select("title")
    .eq("id", assetId)
    .maybeSingle();
  const verb = decision === "approved" ? "approved" : "requested changes on";
  await pingGroupMe(`${ctx.executive.name} ${verb} "${asset?.title ?? "an asset"}"`);

  revalidatePath("/approvals");
  revalidatePath(`/approvals/${assetId}`);
  return { ok: true };
}

// ── Submit / revision reset ──────────────────────────────────────

async function emailRequiredApprovers(
  assetId: string,
  requestedBy: string,
): Promise<void> {
  const supabase = await lpServer();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { data: asset } = await supabase
    .from("assets")
    .select("title, asset_type, description")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return;
  const { data: required } = await supabase
    .from("asset_approvals")
    .select("executive:executives ( email, name )")
    .eq("asset_id", assetId)
    .eq("required", true);

  // supabase-js infers embedded relations as arrays; at runtime a to-one embed
  // is a single object. Handle both shapes.
  const recipients: string[] = [];
  for (const row of (required ?? []) as Array<{
    executive: { email: string } | { email: string }[] | null;
  }>) {
    const exec = Array.isArray(row.executive) ? row.executive[0] : row.executive;
    if (exec?.email) recipients.push(exec.email);
  }

  await Promise.all(
    recipients.map((to) =>
      sendApprovalRequestEmail({
        to,
        assetTitle: asset.title,
        assetType: asset.asset_type,
        description: asset.description,
        requestedBy,
        deepLink: `${appUrl}/approvals/${assetId}`,
      }),
    ),
  );
}

export async function submitAsset(assetId: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin || !ctx.executive) return { ok: false, error: "Admin only." };

  const supabase = await lpServer();
  const { error } = await supabase.rpc("submit_asset", { p_asset_id: assetId });
  if (error) return { ok: false, error: error.message };

  await emailRequiredApprovers(assetId, ctx.executive.name);
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${assetId}`);
  return { ok: true };
}

export async function resetApprovals(
  assetId: string,
  mode: "material" | "minor",
): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const supabase = await lpServer();
  const { error } = await supabase.rpc("reset_approvals", {
    p_asset_id: assetId,
    p_mode: mode,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${assetId}`);
  return { ok: true };
}

// ── Create / edit asset (admin) ──────────────────────────────────

export async function saveAsset(formData: FormData): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin || !ctx.executive) return { ok: false, error: "Admin only." };
  const supabase = await lpServer();

  const assetId = (formData.get("assetId") as string) || null;
  const title = String(formData.get("title") ?? "").trim();
  const asset_type = String(formData.get("asset_type") ?? "") as AssetType;
  const description = String(formData.get("description") ?? "").trim() || null;
  const intent = String(formData.get("intent") ?? "draft"); // 'draft' | 'submit'
  const resetMode = (formData.get("resetMode") as string) || ""; // edit only
  const requiredExecIds: string[] = JSON.parse(
    String(formData.get("requiredExecIds") ?? "[]"),
  );
  const newAttachments: NewAttachment[] = JSON.parse(
    String(formData.get("newAttachments") ?? "[]"),
  );
  const removeAttachmentIds: string[] = JSON.parse(
    String(formData.get("removeAttachmentIds") ?? "[]"),
  );

  if (!title) return { ok: false, error: "Title is required." };
  if (!ASSET_TYPES.includes(asset_type)) {
    return { ok: false, error: "Pick a valid asset type." };
  }

  let id: string;

  if (!assetId) {
    const { data, error } = await supabase
      .from("assets")
      .insert({
        title,
        asset_type,
        description,
        created_by: ctx.executive.id,
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Insert failed." };
    id = data.id as string;

    // Seed one approval row per active executive (required=false, pending).
    const { data: execs } = await supabase
      .from("executives")
      .select("id")
      .eq("active", true);
    if (execs?.length) {
      const { error: seedErr } = await supabase
        .from("asset_approvals")
        .insert(execs.map((e: { id: string }) => ({ asset_id: id, executive_id: e.id })));
      if (seedErr) return { ok: false, error: seedErr.message };
    }
  } else {
    id = assetId;
    const { error } = await supabase
      .from("assets")
      .update({ title, asset_type, description, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  // Required-approver matrix: reset all to false, then flag the chosen ones.
  {
    const { error: clearErr } = await supabase
      .from("asset_approvals")
      .update({ required: false })
      .eq("asset_id", id)
      .eq("required", true);
    if (clearErr) return { ok: false, error: clearErr.message };
    if (requiredExecIds.length) {
      const { error: setErr } = await supabase
        .from("asset_approvals")
        .update({ required: true })
        .eq("asset_id", id)
        .in("executive_id", requiredExecIds);
      if (setErr) return { ok: false, error: setErr.message };
    }
  }

  // Remove attachments (edit).
  if (removeAttachmentIds.length) {
    const { data: toRemove } = await supabase
      .from("asset_attachments")
      .select("id, storage_path")
      .in("id", removeAttachmentIds);
    for (const att of (toRemove ?? []) as Array<{ storage_path: string | null }>) {
      if (att.storage_path) await removeAssetFile(att.storage_path);
    }
    await supabase.from("asset_attachments").delete().in("id", removeAttachmentIds);
  }

  // Append new attachments after the current max sort order.
  const { count } = await supabase
    .from("asset_attachments")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", id);
  let sort = count ?? 0;

  for (const att of newAttachments) {
    if (att.kind === "file") {
      const file = att.fileKey ? (formData.get(att.fileKey) as File | null) : null;
      if (!file) continue;
      if (file.size > MAX_UPLOAD_BYTES) {
        return {
          ok: false,
          error: `"${file.name}" exceeds the ${Math.round(
            MAX_UPLOAD_BYTES / (1024 * 1024),
          )}MB limit — add it as a link instead.`,
        };
      }
      const { path } = await uploadAssetFile(id, file);
      await supabase.from("asset_attachments").insert({
        asset_id: id,
        kind: "file",
        label: att.label || file.name,
        storage_path: path,
        media_type: att.media_type ?? "other",
        sort_order: sort++,
      });
    } else if (att.kind === "link") {
      await supabase.from("asset_attachments").insert({
        asset_id: id,
        kind: "link",
        label: att.label,
        external_url: att.external_url,
        media_type: att.media_type ?? "other",
        sort_order: sort++,
      });
    } else {
      await supabase.from("asset_attachments").insert({
        asset_id: id,
        kind: "text",
        label: att.label,
        inline_text: att.inline_text,
        sort_order: sort++,
      });
    }
  }

  // Submit a fresh draft, or re-open approvals after editing a live asset.
  if (intent === "submit") {
    const { error } = await supabase.rpc("submit_asset", { p_asset_id: id });
    if (error) return { ok: false, error: error.message };
    await emailRequiredApprovers(id, ctx.executive.name);
  } else if (resetMode === "material" || resetMode === "minor") {
    const { error } = await supabase.rpc("reset_approvals", {
      p_asset_id: id,
      p_mode: resetMode,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/approvals");
  revalidatePath(`/approvals/${id}`);
  return { ok: true, assetId: id };
}

// ── Activity feed + notifications ────────────────────────────────

export async function postActivity(formData: FormData): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Not an executive." };
  const body = String(formData.get("body") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "");
  const category = (["content", "automation", "funnel", "other"].includes(categoryRaw)
    ? categoryRaw
    : null) as ActivityCategory | null;
  if (!body) return { ok: false, error: "Write something first." };

  const supabase = await lpServer();
  const { error } = await supabase
    .from("activity_posts")
    .insert({ author_id: ctx.executive.id, body, category });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/approvals");
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.executive) return { ok: false, error: "Not an executive." };
  const supabase = await lpServer();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
