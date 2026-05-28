import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/auth";
import { getActivityFeed } from "@/lib/queries/approvals";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx?.isExecutive) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const feed = await getActivityFeed(40);
  return NextResponse.json(feed);
}
