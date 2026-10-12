import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { latestReportUrl } from "@/lib/queries/marketingCost";
import { normalizeMarketCode } from "@/lib/scorecard/markets";

export const dynamic = "force-dynamic";

/**
 * "Download Brad report": redirect to a 7-day signed URL of the latest
 * Brad-format XLSX for `?market=` (REECE = company) in the private
 * `marketing-reports` bucket. Auth-gated like the other dashboard routes.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const market = normalizeMarketCode(url.searchParams.get("market")) || "REECE";
  try {
    const signed = await latestReportUrl(market);
    if (!signed) return NextResponse.json({ error: "no report yet — the weekly run has not produced a file for this market" }, { status: 404 });
    return NextResponse.redirect(signed, 302);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
