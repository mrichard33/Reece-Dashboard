/**
 * Only a same-site path may follow a login (2026-10-03, security review).
 *
 * /auth/callback redirected to `${appUrl}${next}` with `next` taken straight
 * from the query string. `next=@evil.com` turned that into
 * `https://app.example@evil.com` (a different host), and `next=//evil.com`
 * is protocol-relative. A real path starts with exactly one "/", has no
 * backslash and no control characters; anything else falls back.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/overview"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
