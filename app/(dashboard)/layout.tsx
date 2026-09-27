import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNavProvider } from "@/components/shell/MobileNav";
import { getAccessContext, getPartnerContext } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAccessContext();
  if (!ctx) {
    // A payroll partner (db/migrations/0026) is not a dashboard user; its one
    // page lives outside this layout.
    if (await getPartnerContext()) redirect("/partner/payroll");
    redirect("/login");
  }

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
      {/* h-dvh, not h-screen (2026-09-26): on iOS Safari 100vh counts the area
          behind the collapsing URL bar, so the bottom of every scrolled page
          sat under the browser chrome. On desktop dvh and vh are the same. */}
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar derives its active-tab state from usePathname() client-side —
            the x-pathname header above only serves the exec-only redirect (a
            layout doesn't re-render on client navigation, so a header-derived
            prop would freeze the red highlight at the first-loaded URL). */}
        <Sidebar
          role={ctx.role}
          isExecutive={ctx.isExecutive}
          isAdmin={ctx.isAdmin}
          isExecOnly={ctx.isExecOnly}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
