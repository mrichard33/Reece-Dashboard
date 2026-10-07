import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { hlMcp } from "@/lib/mcp/hlClient";
import { refreshWorkflowFromGhl } from "@/lib/workflows/refreshWorkflow";

export const dynamic = "force-dynamic";

/** Pull one workflow fresh from GHL into the HL cache, then drop the page's cached graph. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const out = await refreshWorkflowFromGhl(id, {
    refresh: hlMcp.refreshWorkflow,
    // expire: 0 — the very next read rebuilds, not a stale-while-revalidate copy.
    invalidate: (wf) => revalidateTag(`workflow-graph:${wf}`, { expire: 0 }),
  });
  if (out.status === 502) console.error("[workflows/refresh]", id, out.body.error);
  return NextResponse.json(out.body, { status: out.status });
}
