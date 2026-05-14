import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

/** Service-role client — bypasses RLS. Use only in trusted server contexts. */
export function lpService() {
  if (!LP_URL || !LP_SERVICE) {
    throw new Error(
      "LP Supabase service env missing. Set LP_SUPABASE_URL and LP_SUPABASE_SERVICE_KEY.",
    );
  }
  return createServerClient(LP_URL, LP_SERVICE, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
