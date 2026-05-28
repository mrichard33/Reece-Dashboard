import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X, Clock } from "lucide-react";
import { requireExecutive } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AttachmentRenderer } from "@/components/approvals/AttachmentRenderer";
import { DecisionButtons } from "@/components/approvals/DecisionButtons";
import { AdminAssetActions } from "@/components/approvals/AdminAssetActions";
import { STATUS_META, ASSET_TYPE_LABEL } from "@/components/approvals/meta";
import { getAssetDetail } from "@/lib/queries/approvals";
import { relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireExecutive();
  if (!ctx.executive) return null;

  const asset = await getAssetDetail(id);
  if (!asset) notFound();

  const status = STATUS_META[asset.status];
  const required = asset.approvals.filter((a) => a.required);
  const myApproval = asset.approvals.find((a) => a.executive_id === ctx.executive!.id);
  const canDecide =
    asset.status === "in_review" &&
    Boolean(myApproval?.required) &&
    myApproval?.decision === "pending";

  return (
    <>
      <TopBar
        email={ctx.email}
        role={ctx.role}
        title={asset.title}
        subtitle={`${ASSET_TYPE_LABEL[asset.asset_type]} · updated ${relTime(asset.updated_at)}`}
        actions={
          ctx.isAdmin ? (
            <AdminAssetActions assetId={asset.id} status={asset.status} />
          ) : undefined
        }
      />

      <div className="space-y-6 p-6">
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Executive Review
        </Link>

        <div className="flex items-center gap-3">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {asset.creator && (
            <span className="text-xs text-slate-500">
              Created by {asset.creator.name}
            </span>
          )}
        </div>

        {asset.description && (
          <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            {asset.description}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Attachments */}
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {asset.attachments.length === 0 ? (
                  <p className="text-sm text-slate-500">No attachments.</p>
                ) : (
                  asset.attachments.map((att) => (
                    <AttachmentRenderer key={att.id} att={att} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Approvals */}
          <div className="space-y-5 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Approvals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {required.length === 0 ? (
                  <p className="text-sm text-slate-500">No required approvers set.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {required.map((a) => (
                      <li key={a.id} className="text-sm">
                        <div className="flex items-center gap-2">
                          {a.decision === "approved" && (
                            <Check className="h-4 w-4 text-emerald-600" />
                          )}
                          {a.decision === "rejected" && (
                            <X className="h-4 w-4 text-rose-600" />
                          )}
                          {a.decision === "pending" && (
                            <Clock className="h-4 w-4 text-slate-400" />
                          )}
                          <span className="font-medium text-navy-900 dark:text-slate-100">
                            {a.executive?.name ?? "Unknown"}
                          </span>
                          {a.executive_id === ctx.executive!.id && (
                            <span className="text-[11px] text-slate-400">(you)</span>
                          )}
                        </div>
                        {a.decision === "rejected" && a.reason && (
                          <p className="ml-6 mt-0.5 text-xs text-rose-600">{a.reason}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canDecide && (
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <DecisionButtons assetId={asset.id} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
