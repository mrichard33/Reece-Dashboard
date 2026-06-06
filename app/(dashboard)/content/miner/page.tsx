import { getAccessContext } from "@/lib/auth";
import { listProposals, listSubtopics, pillarCoverage } from "@/lib/queries/content";
import { MinerPanel } from "@/components/content/MinerPanel";

export const dynamic = "force-dynamic";

export default async function MinerPage() {
  const ctx = await getAccessContext();
  const [proposals, subtopics, coverage] = await Promise.all([
    listProposals(),
    listSubtopics(),
    pillarCoverage(),
  ]);

  return (
    <div className="p-6">
      <MinerPanel
        proposals={proposals}
        subtopics={subtopics}
        coverage={coverage}
        isExecutive={ctx?.isExecutive ?? false}
      />
    </div>
  );
}
