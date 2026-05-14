"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side LP Supabase client — for client components needing realtime
 * subscriptions or interactive auth (e.g. exchanging recovery tokens from the
 * URL hash on the password-reset page).
 *
 * Read-only operations should always go through server components; only use
 * this client when the page must run in the browser.
 */
export function lpBrowser() {
  const url = process.env.NEXT_PUBLIC_LP_SUPABASE_URL ?? process.env.LP_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_LP_SUPABASE_ANON_KEY ?? process.env.LP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Browser LP Supabase env missing. Set NEXT_PUBLIC_LP_SUPABASE_URL and NEXT_PUBLIC_LP_SUPABASE_ANON_KEY.",
    );
  }
  return createBrowserClient(url, key);
}
