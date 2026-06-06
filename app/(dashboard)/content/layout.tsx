import { requireContentAccess } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { ContentNav } from "@/components/content/ContentNav";
import { NeedsApprovalBadge } from "@/components/content/NeedsApprovalBadge";
import { contentEngineReady } from "@/lib/queries/content";

export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContentAccess();
  const ready = await contentEngineReady();
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
      {!ready && (
        <div className="mx-6 mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Content engine tables aren&apos;t set up yet. Apply{" "}
          <code className="font-mono">db/migrations/0003_fb_content_engine.sql</code> and{" "}
          <code className="font-mono">0004_fb_seed.sql</code> in Supabase to enable the
          calendar, idea miner, and message bank.
        </div>
      )}
      {children}
    </>
  );
}
