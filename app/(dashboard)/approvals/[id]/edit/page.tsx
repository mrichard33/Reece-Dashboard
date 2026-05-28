import { notFound } from "next/navigation";
import { requireExecAdmin } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { AssetForm } from "@/components/approvals/AssetForm";
import { getAssetDetail, listExecutives } from "@/lib/queries/approvals";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireExecAdmin();

  const [asset, executives] = await Promise.all([
    getAssetDetail(id),
    listExecutives(),
  ]);
  if (!asset) notFound();

  const requiredExecIds = asset.approvals
    .filter((a) => a.required)
    .map((a) => a.executive_id);

  return (
    <>
      <TopBar
        email={ctx.email}
        role={ctx.role}
        title={`Edit: ${asset.title}`}
        subtitle="Update the asset, attachments, or required approvers"
      />
      <div className="p-6">
        <AssetForm
          mode="edit"
          executives={executives.map((e) => ({ id: e.id, name: e.name }))}
          asset={{
            id: asset.id,
            title: asset.title,
            asset_type: asset.asset_type,
            description: asset.description,
            status: asset.status,
            requiredExecIds,
          }}
          existingAttachments={asset.attachments.map((a) => ({
            id: a.id,
            kind: a.kind,
            label: a.label,
          }))}
        />
      </div>
    </>
  );
}
