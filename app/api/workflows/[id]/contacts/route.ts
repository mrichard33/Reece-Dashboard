import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkflowContacts } from "@/lib/queries/workflowDetail";

export const dynamic = "force-dynamic";

/** Contacts carrying the workflow's active-<code> tag, one keyset page. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const d = sp.get("cursorDate");
  const cid = sp.get("cursorId");
  try {
    const page = await getWorkflowContacts(id, d && cid ? { d, id: cid } : null);
    return NextResponse.json(page);
  } catch (e) {
    console.error("[workflows/contacts]", id, e);
    return NextResponse.json({ error: "Could not read contacts from the GHL cache." }, { status: 500 });
  }
}
