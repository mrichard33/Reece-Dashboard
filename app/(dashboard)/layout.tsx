import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { getAccessContext } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "/";

  // Approver-only executives (e.g. Chris, Randy) live entirely on /approvals.
  if (ctx.isExecOnly && !pathname.startsWith("/approvals")) {
    redirect("/approvals");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={ctx.role}
        isExecutive={ctx.isExecutive}
        isExecOnly={ctx.isExecOnly}
        currentPath={pathname}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
