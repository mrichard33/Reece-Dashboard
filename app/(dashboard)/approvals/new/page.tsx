import { requireExecAdmin } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { AssetForm } from "@/components/approvals/AssetForm";
import { listExecutives } from "@/lib/queries/approvals";

export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  const ctx = await requireExecAdmin();
  const executives = await listExecutives();

  return (
    <>
      <TopBar
        email={ctx.email}
        role={ctx.role}
        title="New asset"
        subtitle="Add a showcase asset and choose who must sign off"
      />
      <div className="p-6">
        <AssetForm
          mode="create"
          executives={executives.map((e) => ({ id: e.id, name: e.name }))}
        />
      </div>
    </>
  );
}
