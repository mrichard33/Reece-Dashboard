import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getLeadCalls,
  getLeadNotes,
  getLeadActivities,
  type FeedType,
} from "@/lib/queries/leads";
import type { Cursor } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const FETCHERS = {
  calls: getLeadCalls,
  notes: getLeadNotes,
  activities: getLeadActivities,
} as const;

function isFeedType(v: string | null): v is FeedType {
  return v === "calls" || v === "notes" || v === "activities";
}

/**
 * "Load more" cursor endpoint for the per-lead feeds. Returns one keyset page
 * `{ rows, nextCursor }`. No exact count, no OFFSET — see lib/queries/leads.ts.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  if (!isFeedType(type)) {
    return NextResponse.json({ error: "invalid feed type" }, { status: 400 });
  }

  const cursorDate = url.searchParams.get("cursorDate");
  const cursorId = url.searchParams.get("cursorId");
  const cursor: Cursor =
    cursorDate && cursorId ? { lastDate: cursorDate, lastId: cursorId } : null;

  const page = await FETCHERS[type](id, cursor);
  return NextResponse.json(page);
}
