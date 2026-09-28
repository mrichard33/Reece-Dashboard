import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { PayrollView } from "@/components/payroll/PayrollView";
import { isPayrollApprover } from "@/lib/queries/payroll";

export const dynamic = "force-dynamic";

/**
 * Payroll — Reece staff view (operators). Every partner's weeks, shadow and
 * live, and the dispute tickets. Active lf_report_approvers (Mark, Brad) see
 * Approve / Deny on open tickets; LP MCP re-checks that on every decision.
 * The partner's own view is /partner/payroll.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  if (ctx.isExecOnly) redirect("/approvals");
  if (ctx.role !== "operator") redirect("/overview");

  const [sp, canDecide] = await Promise.all([searchParams, isPayrollApprover(ctx.email)]);

  return (
    <>
      <TopBar email={ctx.email} role={ctx.role} title="Payroll" />
      <div className="p-4 lg:p-6">
        <PayrollView scope={{ kind: "staff" }} basePath="/payroll" searchParams={sp} canFile={false} canDecide={canDecide} />
      </div>
    </>
  );
}
