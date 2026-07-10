/**
 * TEMP diagnostic — capture the real /scorecard server render error.
 *
 * Next strips the error message in production when it bubbles to error.tsx (only a
 * digest survives). onRequestError runs server-side and receives the ORIGINAL error,
 * so we persist message + stack to LP Supabase (scorecard_error_log) where it can be
 * read directly. Scoped to /scorecard and best-effort (never throws). Remove once the
 * cause is identified.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string },
): Promise<void> {
  try {
    const path = request?.path ?? "";
    if (!path.includes("/scorecard")) return;
    const url = process.env.LP_SUPABASE_URL;
    const key = process.env.LP_SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const e = err as { message?: unknown; stack?: unknown; digest?: unknown };
    await sb.from("scorecard_error_log").insert({
      path,
      message: String(e?.message ?? err),
      stack: String(e?.stack ?? ""),
      digest: e?.digest != null ? String(e.digest) : null,
    });
  } catch {
    /* diagnostics must never affect the request */
  }
}
