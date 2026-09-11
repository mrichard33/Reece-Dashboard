import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only LP Supabase clients. Importing this file in a client component
 * is a build error — use `lib/supabase/lp-browser.ts` for the browser client.
 */

const LP_URL = process.env.LP_SUPABASE_URL!;
const LP_ANON = process.env.LP_SUPABASE_ANON_KEY!;
const LP_SERVICE = process.env.LP_SUPABASE_SERVICE_KEY!;

function assertEnv() {
  if (!LP_URL || !LP_ANON) {
    throw new Error(
      "LP Supabase env missing. Set LP_SUPABASE_URL and LP_SUPABASE_ANON_KEY.",
    );
  }
}

/** Server component / route handler client — respects user session via cookies. */
export async function lpServer() {
  assertEnv();
  const cookieStore = await cookies();
  return createServerClient(LP_URL, LP_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* called from a Server Component — middleware refreshes the session */
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Use only in trusted server contexts.
 *
 * Memoized at module scope. This client holds NO per-request state: its cookie
 * adapter is a pair of stubs, so every call was returning an identical object.
 * Rebuilding it was pure waste — a single Bot Review render calls this ~15
 * times, and there are 46 call sites across the app. The instance is a thin
 * wrapper over `fetch`, so sharing it across requests is safe; do NOT apply the
 * same trick to `lpServer()`, which is bound to one request's cookies.
 */
let _lpService: SupabaseClient | null = null;

export function lpService() {
  if (!LP_URL || !LP_SERVICE) {
    throw new Error(
      "LP Supabase service env missing. Set LP_SUPABASE_URL and LP_SUPABASE_SERVICE_KEY.",
    );
  }
  _lpService ??= createServerClient(LP_URL, LP_SERVICE, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  return _lpService;
}
