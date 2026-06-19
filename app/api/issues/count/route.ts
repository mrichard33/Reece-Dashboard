import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/auth";
import { openIssuesCount } from "@/lib/queries/issues";

export const dynamic = "force-dynamic";

/** Open-issue count for the nav badge + top-bar chip. Any authenticated user. */
export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const count = await openIssuesCount();
  return NextResponse.json({ count });
}
