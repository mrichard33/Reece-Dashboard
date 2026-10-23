import type { Route } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Sources & lead cost moved to Marketing Spend, where it is the first, default
 * tab (the user, 2026-10-23: it "should be under Marketing Spend as the main
 * tab"). Old links and bookmarks land there with their market, period, grain,
 * spread toggle and tab, so `?tab=invoices` still opens the invoices.
 */
export default async function ScorecardSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const carry = new URLSearchParams();
  for (const k of ["period", "start", "end", "market", "grain", "tab", "cc"]) {
    const v = params[k];
    if (typeof v === "string" && v) carry.set(k, v);
  }
  redirect(`/marketing-spend${carry.size ? `?${carry.toString()}` : ""}` as Route);
}
