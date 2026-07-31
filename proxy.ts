import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward the pathname so server-component layouts can highlight active nav.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // TV kiosk surface — deliberately unauthenticated. The page reads only the
  // same-origin /api/capacity-board proxy, whose payload is per-market
  // appointment COUNTS (zero PII). A kiosk browser can't complete a login.
  const isKiosk =
    pathname === "/board/tv" ||
    pathname.startsWith("/board/tv/") ||
    pathname === "/api/capacity-board";

  // Return BEFORE constructing the Supabase client (2026-07-31).
  //
  // This check used to sit BELOW an unconditional `await
  // supabase.auth.getUser()`, so the kiosk was exempt from the login REDIRECT
  // but not from the auth ROUND-TRIP. getUser() contacts the Auth server on
  // every invocation by design — it does not trust the local JWT — so every
  // 60s poll from every wall TV, on top of every shell poll from every open
  // dashboard tab, spent one GET /auth/v1/user. At that volume Auth latency
  // degraded to 2–7s (observed max 7.35s), every request on the service
  // queued behind it, and /api/capacity-board blew its own upstream abort and
  // returned 502. Three consecutive 502s blank the wall TVs behind a DATA
  // STALE overlay while LP-MCP is perfectly healthy.
  //
  // The tell: during a stall, /reece-circle-logo.png served in 2ms while
  // /board/tv took 18,853ms — same container, same instant. The only
  // difference is that the PNG is excluded from the matcher below. Container
  // CPU sat at 0.003 of 32 cores throughout: nothing was starved, everything
  // was waiting on Auth.
  //
  // The kiosk needs no session, so it must not pay for one. Keep this above
  // every Supabase call.
  if (isKiosk) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.LP_SUPABASE_URL!,
    process.env.LP_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isAuthCallback = pathname.startsWith("/auth/callback");
  const isResetPassword = pathname.startsWith("/auth/reset-password");

  // Unauthenticated users are bounced to /login (except for the login flow itself).
  if (!user && !isLogin && !isAuthCallback && !isResetPassword) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated users on /login go home.
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Skip Next internals, static assets, and the auth callback handler.
     * The middleware still runs on every page navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
