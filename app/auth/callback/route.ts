import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase auth callback. Handles password-reset (recovery) emails and any
 * future OAuth flows. Exchanges the `code` query param for a session cookie,
 * then routes the user to the right next page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/overview";

  // Always use the public app URL, not request.nextUrl.origin.
  // On Railway, the container's internal origin is 0.0.0.0:PORT — using it
  // produces redirects to restricted/unreachable ports.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return new NextResponse(
      "Server misconfigured: NEXT_PUBLIC_APP_URL is not set.",
      { status: 500 },
    );
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.LP_SUPABASE_URL!,
    process.env.LP_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (type === "recovery") {
    return NextResponse.redirect(`${appUrl}/auth/reset-password`);
  }

  return NextResponse.redirect(`${appUrl}${next}`);
}
