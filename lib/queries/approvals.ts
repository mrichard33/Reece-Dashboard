import { lpServer } from "@/lib/supabase/lp";
import { signedUrl } from "@/lib/storage";
import type {
  Asset,
  AssetAttachment,
  ApprovalDecision,
  Executive,
  FeedItem,
  AppNotification,
} from "@/lib/supabase/types";

export type ApprovalWithExec = {
  id: string;
  executive_id: string;
  required: boolean;
  decision: ApprovalDecision;
  reason: string | null;
  decided_at: string | null;
  executive: { id: string; name: string } | null;
};

export type AssetListItem = Asset & {
  approvals: ApprovalWithExec[];
  attachments: Array<
    Pick<
      AssetAttachment,
      "id" | "kind" | "label" | "media_type" | "external_url" | "sort_order"
    >
  >;
};

export type RenderableAttachment = AssetAttachment & { url: string | null };

export type AssetDetail = Asset & {
  creator: { id: string; name: string } | null;
  approvals: ApprovalWithExec[];
  attachments: RenderableAttachment[];
};

const ASSET_SELECT = `
  id, title, asset_type, description, status, created_by, submitted_at, approved_at, created_at, updated_at,
  approvals:asset_approvals (
    id, executive_id, required, decision, reason, decided_at,
    executive:executives ( id, name )
  ),
  attachments:asset_attachments ( id, kind, label, media_type, external_url, sort_order )
`;

/** All assets the caller may see (RLS hides others' drafts). Newest first. */
export async function listAssets(): Promise<AssetListItem[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  const rows = (data ?? []) as unknown as AssetListItem[];
  for (const a of rows) {
    a.attachments?.sort((x, y) => x.sort_order - y.sort_order);
  }
  return rows;
}

/** Active executives, ordered by name. Used for matrices and name maps. */
export async function listExecutives(): Promise<Executive[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("executives")
    .select("id, user_id, name, email, is_admin, active, created_at")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`Failed to load executives: ${error.message}`);
  return (data ?? []) as Executive[];
}

/** One asset with attachments (signed URLs for files) + approval matrix. */
export async function getAssetDetail(id: string): Promise<AssetDetail | null> {
  const supabase = await lpServer();
  const { data: asset, error } = await supabase
    .from("assets")
    .select(
      `id, title, asset_type, description, status, created_by, submitted_at, approved_at, created_at, updated_at,
       creator:executives!created_by ( id, name ),
       approvals:asset_approvals (
         id, executive_id, required, decision, reason, decided_at,
         executive:executives ( id, name )
       )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load asset: ${error.message}`);
  if (!asset) return null;

  const { data: rawAttachments, error: attErr } = await supabase
    .from("asset_attachments")
    .select(
      "id, asset_id, kind, label, storage_path, external_url, inline_text, media_type, sort_order, created_at",
    )
    .eq("asset_id", id)
    .order("sort_order");
  if (attErr) throw new Error(`Failed to load attachments: ${attErr.message}`);

  const attachments: RenderableAttachment[] = await Promise.all(
    ((rawAttachments ?? []) as AssetAttachment[]).map(async (att) => ({
      ...att,
      url:
        att.kind === "file" && att.storage_path
          ? await signedUrl(att.storage_path)
          : att.external_url,
    })),
  );

  return { ...(asset as unknown as AssetDetail), attachments };
}

/** Unified activity feed (events + manual posts), newest first, with names. */
export async function getActivityFeed(limit = 40): Promise<
  Array<FeedItem & { actorName: string | null }>
> {
  const supabase = await lpServer();
  const [{ data: feed, error }, execs] = await Promise.all([
    supabase
      .from("v_activity_feed")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    listExecutives(),
  ]);
  if (error) throw new Error(`Failed to load activity: ${error.message}`);
  const nameById = new Map(execs.map((e) => [e.id, e.name]));
  return ((feed ?? []) as FeedItem[]).map((f) => ({
    ...f,
    actorName: f.actor_id ? (nameById.get(f.actor_id) ?? null) : null,
  }));
}

export async function getNotifications(): Promise<{
  items: AppNotification[];
  unread: number;
}> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, type, asset_id, body, read, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to load notifications: ${error.message}`);
  const items = (data ?? []) as AppNotification[];
  return { items, unread: items.filter((n) => !n.read).length };
}
