import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getLeadGurusSummary } from "@/lib/queries/leadgurus";

export const dynamic = "force-dynamic";

/**
 * Paid Media (Lead Gurus) summary endpoint. Returns the latest day's headline
 * metrics, a spend-vs-revenue trend, and the per-territory breakdown, read from
 * the `ft_*` ingest tables in LP Supabase. Auth-gated like the other dashboard
 * routes.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

  try {
    const summary = await getLeadGurusSummary(days);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to load Lead Gurus summary" },
      { status: 500 },
    );
  }
}
