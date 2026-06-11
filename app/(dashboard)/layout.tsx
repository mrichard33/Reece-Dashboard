import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNavProvider } from "@/components/shell/MobileNav";
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

  // Approver-only executives (e.g. Chris, Randy) live on /approvals and /content
  // (the Facebook post review surface) — everything else redirects them home.
  if (
    ctx.isExecOnly &&
    !pathname.startsWith("/approvals") &&
    !pathname.startsWith("/content")
  ) {
    redirect("/approvals");
  }

  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          role={ctx.role}
          isExecutive={ctx.isExecutive}
          isAdmin={ctx.isAdmin}
          isExecOnly={ctx.isExecOnly}
          currentPath={pathname}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
