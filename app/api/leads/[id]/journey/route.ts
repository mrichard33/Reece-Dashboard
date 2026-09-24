import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getJourney } from "@/lib/journey/build";

export const dynamic = "force-dynamic";

/**
 * One contact's merged journey (HL + LP). `?fresh=1` skips the 60s cache —
 * the card's Refresh button. LP down still answers 200 with `sources.lp`
 * set; only an HL failure is a 500.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    const journey = await getJourney(id, { fresh });
    if (!journey) return NextResponse.json({ error: "No GHL contact with that id." }, { status: 404 });
    return NextResponse.json(journey);
  } catch (e) {
    console.error("[leads/journey]", id, e);
    return NextResponse.json(
      { error: "Could not read this contact from the GHL cache. Try again in a minute." },
      { status: 500 },
    );
  }
}
