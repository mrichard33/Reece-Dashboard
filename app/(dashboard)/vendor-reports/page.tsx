import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { VendorReportsView } from "@/components/vendor-reports/VendorReportsView";
import { getVendorReportsPageData } from "@/lib/queries/vendorReports";
import { getAccessContext } from "@/lib/auth";

/**
 * /vendor-reports (2026-10-14): the weekly Vendor Disposition Report's
 * vendor list (n8n "06 VDR", LP table `vdr_vendor_config`). Each lead vendor
 * gets a CSV of every lead it sent in the last 90 days with its LP status;
 * rev-share vendors also get the week's Payable Jobs. Operators edit emails,
 * rev share and on/off here. Dry run (report to Mark only vs. to the vendor)
 * is switched by Mark alone; the server action enforces that.
 */

export const dynamic = "force-dynamic";

export default async function VendorReportsPage() {
  const user = await requireRole("operator");
  const [data, ctx] = await Promise.all([getVendorReportsPageData(), getAccessContext()]);

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Vendor reports" />
      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="Vendor reports"
          subtitle="Who gets the weekly lead-status email, where it goes, and whether it is live or still a dry run to Mark. Changes take effect on the next hourly run."
        />
        <VendorReportsView data={data} isAdmin={ctx?.isAdmin ?? false} />
      </div>
    </>
  );
}
