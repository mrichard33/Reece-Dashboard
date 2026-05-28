import Link from "next/link";
import { Plus } from "lucide-react";
import { requireExecutive } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { AssetBrowser } from "@/components/approvals/AssetBrowser";
import { ActivityFeed } from "@/components/approvals/ActivityFeed";
import { PostUpdateBox } from "@/components/approvals/PostUpdateBox";
import { listAssets, getActivityFeed } from "@/lib/queries/approvals";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await requireExecutive();
  if (!ctx.executive) return null;

  const [assets, feed] = await Promise.all([listAssets(), getActivityFeed(40)]);

  return (
    <>
      <TopBar
        email={ctx.email}
        role={ctx.role}
        title="Executive Review"
        subtitle="Showcase, approvals, and live activity"
        actions={
          ctx.isAdmin ? (
            <Link
              href="/approvals/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-navy-700 dark:bg-navy-700 dark:hover:bg-navy-600"
            >
              <Plus className="h-4 w-4" /> New asset
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AssetBrowser
            assets={assets}
            myExecId={ctx.executive.id}
            isAdmin={ctx.isAdmin}
          />
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ctx.isAdmin && <PostUpdateBox />}
              <ActivityFeed initial={feed} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
