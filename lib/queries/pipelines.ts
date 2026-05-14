import { hlService } from "@/lib/supabase/hl";
import type { Opportunity, Pipeline, Stage } from "@/lib/supabase/types";

export type PipelineCard = {
  id: string;
  name: string;
  count: number;
  totalValue: number;
  stages: Array<{ id: string; name: string; position: number; count: number; avgAgeDays: number }>;
};

export async function getPipelineCards(): Promise<PipelineCard[]> {
  const sb = hlService();

  const [pipesRes, stagesRes, oppsRes] = await Promise.all([
    sb.from("pipelines").select("id, name, ghl_pipeline_id"),
    sb.from("stages").select("id, pipeline_id, name, position"),
    sb
      .from("opportunities")
      .select("id, pipeline_id, pipeline_stage_id, monetary_value, status, updated_at")
      .eq("status", "open"),
  ]);

  const pipelines = (pipesRes.data ?? []) as Pipeline[];
  const stages = (stagesRes.data ?? []) as Stage[];
  const opps = (oppsRes.data ?? []) as Pick<
    Opportunity,
    "id" | "pipeline_id" | "pipeline_stage_id" | "monetary_value" | "updated_at"
  >[];

  const now = Date.now();

  return pipelines
    .map((p) => {
      const pipelineStages = stages
        .filter((s) => s.pipeline_id === p.id)
        .sort((a, b) => a.position - b.position);

      const pipelineOpps = opps.filter((o) => o.pipeline_id === p.id);

      const stageData = pipelineStages.map((s) => {
        const stageOpps = pipelineOpps.filter((o) => o.pipeline_stage_id === s.id);
        const avgAgeDays =
          stageOpps.length === 0
            ? 0
            : Math.round(
                stageOpps.reduce(
                  (acc, o) =>
                    acc + (now - new Date(o.updated_at).getTime()) / 86400000,
                  0,
                ) / stageOpps.length,
              );
        return {
          id: s.id,
          name: s.name,
          position: s.position,
          count: stageOpps.length,
          avgAgeDays,
        };
      });

      return {
        id: p.id,
        name: p.name,
        count: pipelineOpps.length,
        totalValue: pipelineOpps.reduce(
          (acc, o) => acc + (o.monetary_value ?? 0),
          0,
        ),
        stages: stageData,
      };
    })
    .sort((a, b) => b.count - a.count);
}
