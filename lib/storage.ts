import { lpServer } from "@/lib/supabase/lp";

export const ASSET_MEDIA_BUCKET = "asset-media";

/**
 * Per-file ceiling for self-hosted media. Supabase's default tier caps uploads
 * around 50 MB; the uploader nudges oversized video toward a link attachment
 * (YouTube/Drive) instead of failing mid-upload. Confirm the project's actual
 * limit and adjust if the plan allows larger objects.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/** Storage path convention: assets/{assetId}/{uuid}-{original}. */
export function buildStoragePath(assetId: string, fileName: string): string {
  return `assets/${assetId}/${crypto.randomUUID()}-${safeName(fileName)}`;
}

/** Uploads a file to the private asset-media bucket. RLS requires admin. */
export async function uploadAssetFile(
  assetId: string,
  file: File,
): Promise<{ path: string }> {
  const supabase = await lpServer();
  const path = buildStoragePath(assetId, file.name);
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path };
}

/** Short-lived signed URL for inline playback of a stored object. */
export async function signedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = await lpServer();
  const { data, error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Best-effort removal of a stored object (used when deleting attachments). */
export async function removeAssetFile(path: string): Promise<void> {
  const supabase = await lpServer();
  await supabase.storage.from(ASSET_MEDIA_BUCKET).remove([path]);
}
