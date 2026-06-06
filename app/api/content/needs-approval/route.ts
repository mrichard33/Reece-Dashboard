import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/auth";
import { needsApprovalCount } from "@/lib/queries/content";

export const dynamic = "force-dynamic";

/** Badge count for the Content area header — any authenticated dashboard user. */
export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const count = await needsApprovalCount();
  return NextResponse.json({ count });
}
