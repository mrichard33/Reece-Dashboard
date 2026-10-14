import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { VendorReportsView } from "@/components/vendor-reports/VendorReportsView";
import { getVendorReportsPageData } from "@/lib/queries/vendorReports";

/**
 * /vendor-reports (2026-10-14): the weekly Vendor Disposition Report's
 * vendor list (n8n "06 VDR", LP table `vdr_vendor_config`). Each lead vendor
 * gets a CSV of every lead it sent in the last 90 days with its LP status;
 * rev-share vendors also get the period's Payable Jobs. Operators edit emails,
 * sub-sources, rev share, frequency (weekly on Monday / monthly on the 1st) and
 * on/off here. Dry run is retired from the page (Mark, 2026-10-14).
 */

export const dynamic = "force-dynamic";

export default async function VendorReportsPage() {
  const user = await requireRole("operator");
  const data = await getVendorReportsPageData();

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Vendor reports" />
      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="Vendor reports"
          subtitle="Who gets the lead-status email, where it goes, and how often: every Monday or the 1st of each month. Changes take effect on the next LP feed email."
        />
        <VendorReportsView data={data} />
      </div>
    </>
  );
}
