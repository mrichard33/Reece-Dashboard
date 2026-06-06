import { requireContentAccess } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { ContentNav } from "@/components/content/ContentNav";
import { NeedsApprovalBadge } from "@/components/content/NeedsApprovalBadge";

export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContentAccess();
  return (
    <>
      <TopBar
        email={ctx.email}
        role={ctx.role}
        title="Content"
        subtitle="Automated Facebook post engine"
        actions={<NeedsApprovalBadge />}
      />
      <ContentNav />
      {children}
    </>
  );
}
