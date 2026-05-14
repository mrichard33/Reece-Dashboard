import { createServerClient } from "@supabase/ssr";

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
 */
export function hlServer() {
  assertEnv();
  return createServerClient(HL_URL, HL_ANON, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

export function hlService() {
  if (!HL_URL || !HL_SERVICE) {
    throw new Error(
      "HL Supabase service env missing. Set HL_SUPABASE_URL and HL_SUPABASE_SERVICE_KEY.",
    );
  }
  return createServerClient(HL_URL, HL_SERVICE, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
