import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getLeadsPage, parseLeadsQuery } from "@/lib/queries/leadsList";

export const dynamic = "force-dynamic";

/**
 * Leads tab "Load more" + filter refresh. Same query-string grammar as the
 * /leads page (parseLeadsQuery), returns one keyset page `{ rows, nextCursor }`.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sp: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams) (sp[k] ??= []).push(v);
  const { filters, search, cursor } = parseLeadsQuery(sp);

  try {
    return NextResponse.json(await getLeadsPage({ cursor, filters, search }));
  } catch (e) {
    console.error("[leads/list]", e);
    return NextResponse.json(
      { error: "Could not read leads from the GHL cache. Try again in a minute." },
      { status: 500 },
    );
  }
}
