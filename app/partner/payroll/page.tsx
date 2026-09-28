import { redirect } from "next/navigation";
import { getPartnerContext } from "@/lib/auth";
import { PayrollView } from "@/components/payroll/PayrollView";

export const dynamic = "force-dynamic";

/**
 * Payroll — the partner's own view. Scoped to the partner_id on the signed-in
 * account (never a URL value): its weeks, its lines, its tickets. It files
 * tickets; it never decides them.
 */
export default async function PartnerPayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const partner = await getPartnerContext();
  if (!partner) redirect("/login");
  const sp = await searchParams;
  return (
    <PayrollView
      scope={{ kind: "partner", partnerId: partner.partnerId }}
      basePath="/partner/payroll"
      searchParams={sp}
      canFile
      canDecide={false}
    />
  );
}
