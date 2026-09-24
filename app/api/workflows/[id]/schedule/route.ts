import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { loadWorkflowGraph } from "@/lib/journey/workflowGraph.server";
import { linearizeSchedule } from "@/lib/journey/workflowGraph";

export const dynamic = "force-dynamic";

/** A workflow's linear send schedule, computed from its step graph. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const graph = await loadWorkflowGraph(id);
    return NextResponse.json({ workflowId: id, rows: linearizeSchedule(graph) });
  } catch (e) {
    console.error("[workflows/schedule]", id, e);
    return NextResponse.json({ error: "Could not read this workflow's steps from the GHL cache." }, { status: 500 });
  }
}
