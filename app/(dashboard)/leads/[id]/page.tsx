import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { JourneyCard } from "@/components/journey/JourneyCard";
import { getJourney } from "@/lib/journey/build";
import { resolveLpId } from "@/lib/queries/leadsList";

export const dynamic = "force-dynamic";

/**
 * One lead's full journey, keyed by `ghl_contact_id`.
 *
 * Older links (Activity feed, bookmarks) carry the numeric LP lead id. Those
 * resolve through `lp_leads` (then the GHL custom fields) and redirect, so a
 * link written before the journey existed still lands on the right person.
 */
export default async function LeadJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  if (/^\d+$/.test(id)) {
    const ghl = await resolveLpId(id);
    if (!ghl) notFound();
    redirect(`/leads/${ghl}` as Route);
  }

  let journey;
  try {
    journey = await getJourney(id);
  } catch (e) {
    console.error("[leads/[id]]", id, e);
    return (
      <>
        <TopBar email={user.email} role={user.role} title="Lead" />
        <p className="p-6 text-sm text-rose-600 dark:text-rose-400">
          Could not read this contact from the GHL cache. Try again in a minute.
        </p>
      </>
    );
  }
  if (!journey) notFound();

  return (
    <>
      <TopBar email={user.email} role={user.role} title={journey.header.name} subtitle="Customer journey" />

      <div className="space-y-6 p-4 sm:p-6">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Link>

        <Card>
          <CardContent className="pt-4">
            <JourneyCard initial={journey} variant="full" />
          </CardContent>
        </Card>

      </div>
    </>
  );
}
