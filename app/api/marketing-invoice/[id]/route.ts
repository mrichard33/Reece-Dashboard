import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { lpService } from "@/lib/supabase/lp";

export const dynamic = "force-dynamic";

/** Open the original invoice file: a short signed URL minted per click, never stored. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const sb = lpService();
  const { data: doc } = await sb.from("marketing_invoice_documents").select("storage_bucket, storage_path").eq("id", id).maybeSingle();
  if (!doc?.storage_path) return NextResponse.json({ error: "no file for this invoice" }, { status: 404 });
  const { data } = await sb.storage.from(doc.storage_bucket || "marketing-invoices").createSignedUrl(doc.storage_path, 10 * 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "could not sign the file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
