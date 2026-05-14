import { headers } from "next/headers";
import { Sidebar } from "@/components/shell/Sidebar";
import { requireUser } from "@/components/shell/RoleGate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "/";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={user.role} currentPath={pathname} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
