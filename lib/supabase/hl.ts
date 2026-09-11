import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const HL_URL = process.env.HL_SUPABASE_URL!;
const HL_ANON = process.env.HL_SUPABASE_ANON_KEY!;
const HL_SERVICE = process.env.HL_SUPABASE_SERVICE_KEY!;

function assertEnv() {
  if (!HL_URL || !HL_ANON) {
    throw new Error(
      "HL Supabase env missing. Set HL_SUPABASE_URL and HL_SUPABASE_ANON_KEY.",
    );
  }
}

/**
 * HL Supabase is read-only from this dashboard and is a separate instance from LP.
 * Auth is handled against LP only — for HL we always use the anon or service key
 * (no session cookies). RLS on HL should allow public read of the cache tables.
 *
 * Both clients are memoized at module scope: neither carries per-request state
 * (the cookie adapter is a pair of stubs), so each call was rebuilding an
 * identical object. See the note in `lp.ts` — the same reasoning applies, and
 * for the same reason it is safe here but NOT for LP's cookie-bound `lpServer`.
 */
let _hlServer: SupabaseClient | null = null;
let _hlService: SupabaseClient | null = null;

export function hlServer() {
  assertEnv();
  _hlServer ??= createServerClient(HL_URL, HL_ANON, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  return _hlServer;
}

export function hlService() {
  if (!HL_URL || !HL_SERVICE) {
    throw new Error(
      "HL Supabase service env missing. Set HL_SUPABASE_URL and HL_SUPABASE_SERVICE_KEY.",
    );
  }
  _hlService ??= createServerClient(HL_URL, HL_SERVICE, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  return _hlService;
}
