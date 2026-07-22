import { NextResponse, type NextRequest } from "next/server";

/**
 * Same-origin proxy for the LP-MCP capacity board aggregate.
 *
 * The TV browser must talk to ONE host: the board polls THIS route only,
 * never the LP-MCP Railway origin directly (CORS failure, and it would couple
 * the kiosk to a second host). This route fetches LP-MCP /board/capacity
 * server-side and returns it verbatim with a short cache so seven TVs
 * polling at 60s cost LP-MCP at most ~2 requests/min.
 *
 * Unauthenticated by design (see proxy.ts allow-list): the payload is
 * per-market appointment COUNTS only — zero PII.
 */

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000; // ≤30s per the handoff
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type CacheEntry = { at: number; status: number; body: unknown };
const cache = new Map<string, CacheEntry>();

function baseUrl(): string {
  // CAPACITY_API_BASE is the dedicated override; LP_MCP_URL (the same Railway
  // origin) is the sensible default so one env var doesn't block the board.
  const base = process.env.CAPACITY_API_BASE ?? process.env.LP_MCP_URL ?? "";
  return base.trim().replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (date && !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const base = baseUrl();
  if (!base) {
    return NextResponse.json(
      { error: "CAPACITY_API_BASE (or LP_MCP_URL) is not configured" },
      { status: 500 },
    );
  }

  const key = date || "today";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body, { status: hit.status });
  }

  try {
    const upstream = await fetch(
      `${base}/board/capacity${date ? `?date=${date}` : ""}`,
      { cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );
    const body = (await upstream.json()) as unknown;
    // Cache successes only — a transient upstream failure shouldn't pin an
    // error on screen for the TTL; the board's next poll retries immediately.
    if (upstream.ok) cache.set(key, { at: Date.now(), status: upstream.status, body });
    return NextResponse.json(body, { status: upstream.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "capacity upstream unreachable" },
      { status: 502 },
    );
  }
}
