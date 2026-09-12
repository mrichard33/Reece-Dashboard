import { NextResponse, type NextRequest } from "next/server";
// Freshness recomputation lives in lib/ so it is unit-tested directly rather
// than through Next's request plumbing. See its header for the numerator rule.
import { withHonestStale, type BoardPayload } from "@/lib/capacity/boardFreshness";

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
 *
 * Failure policy (2026-07-31): this route shares a container with the
 * authenticated dashboard shell. Under contention the Node event loop stalls
 * and this handler — which touches no database and makes exactly one ~300ms
 * outbound call — has been observed taking 15–36s. The old 15s abort turned
 * that stall into a 502, three of which blank the wall TVs behind a DATA
 * STALE overlay even though LP-MCP is perfectly healthy. So: hold the last
 * good payload per date and replay it rather than fail. Replays are NOT
 * passed off as fresh — see withHonestStale().
 */

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000; // ≤30s per the handoff
const UPSTREAM_TIMEOUT_MS = 25_000; // was 15s; LP-MCP itself answers in ~300ms
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type CacheEntry = { at: number; status: number; body: unknown };
const cache = new Map<string, CacheEntry>();
// Last SUCCESSFUL payload per date key. Deliberately has no TTL: an old real
// number with an honest timestamp beats a blank screen, and the freshness
// recomputation below is what stops it from ever lying.
const lastGood = new Map<string, BoardPayload>();

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

  const replay = () => {
    const good = lastGood.get(key);
    return good ? NextResponse.json(withHonestStale(good), { status: 200 }) : null;
  };

  try {
    const upstream = await fetch(
      `${base}/board/capacity${date ? `?date=${date}` : ""}`,
      { cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
    );
    const body = (await upstream.json()) as BoardPayload;

    if (upstream.ok) {
      // Cache successes only — a transient upstream failure shouldn't pin an
      // error on screen for the TTL; the board's next poll retries immediately.
      cache.set(key, { at: Date.now(), status: upstream.status, body });
      lastGood.set(key, body);
      return NextResponse.json(body, { status: upstream.status });
    }

    // Upstream answered but not with a usable board (5xx, 4xx). Prefer the
    // last good numbers over propagating a status the kiosk renders as blank.
    return replay() ?? NextResponse.json(body, { status: upstream.status });
  } catch (e) {
    // Timeout, abort, DNS, connection reset, malformed JSON.
    return (
      replay() ??
      NextResponse.json(
        { error: e instanceof Error ? e.message : "capacity upstream unreachable" },
        { status: 502 },
      )
    );
  }
}
