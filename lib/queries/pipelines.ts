import { hlService } from "@/lib/supabase/hl";
import type {
  HlContact,
  Opportunity,
  Pipeline,
  Stage,
} from "@/lib/supabase/types";

export type EnrichedOpportunity = {
  id: string;
  pipeline_id: string;
  pipeline_stage_id: string;
  contact_id: string | null;
  contact_name: string;
  lp_prospect_id: string | null;
  monetary_value: number | null;
  updated_at: string;
};

export type PipelineCard = {
  id: string;
  name: string;
  count: number;
  totalValue: number;
  stages: Array<{
    id: string;
    name: string;
    position: number;
    count: number;
    avgAgeDays: number;
  }>;
  recentOpps: EnrichedOpportunity[];
  /** True when the HL contacts enrichment query failed and we are falling
   * back to contact_id-only rendering. Surface this in the UI so operators
   * know the gap is in the data layer, not the contact set. */
  contactsFallback: boolean;
};

const LP_PROSPECT_FIELD_ID = "ZRQAVrzhtzApzLlHmT87";

export function extractLpProspectId(customFields: unknown): string | null {
  if (!Array.isArray(customFields)) return null;
  for (const f of customFields) {
    if (
      f !== null &&
      typeof f === "object" &&
      "id" in f &&
      (f as { id: unknown }).id === LP_PROSPECT_FIELD_ID
    ) {
      const value = (f as { value?: unknown }).value;
      return value === null || value === undefined ? null : String(value);
    }
  }
  return null;
}

function contactDisplayName(c: HlContact): string {
  const parts = [c.first_name, c.last_name].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  if (parts.length > 0) return parts.join(" ");
  return c.email ?? c.phone ?? `contact ${c.id.slice(0, 8)}`;
}

export async function getPipelineCards(): Promise<PipelineCard[]> {
  const sb = hlService();

  const [pipesRes, stagesRes, oppsRes] = await Promise.all([
    sb.from("pipelines").select("id, name, ghl_pipeline_id"),
    sb.from("stages").select("id, pipeline_id, name, position"),
    sb
      .from("opportunities")
      .select(
        "id, pipeline_id, pipeline_stage_id, contact_id, monetary_value, status, updated_at",
      )
      .eq("status", "open"),
  ]);

  const pipelines = (pipesRes.data ?? []) as Pipeline[];
  const stages = (stagesRes.data ?? []) as Stage[];
  const opps = (oppsRes.data ?? []) as Pick<
    Opportunity,
    | "id"
    | "pipeline_id"
    | "pipeline_stage_id"
    | "contact_id"
    | "monetary_value"
    | "updated_at"
  >[];

  // Fetch HL contacts for every contact_id present on an opp.
  const contactIds = Array.from(
    new Set(
      opps
        .map((o) => o.contact_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  let contactsById = new Map<string, HlContact>();
  let contactsFallback = false;
  if (contactIds.length > 0) {
    try {
      const { data, error } = await sb
        .from("contacts")
        .select("id, first_name, last_name, phone, email, custom_fields")
        .in("id", contactIds);
      if (error) throw error;
      const rows = (data ?? []) as HlContact[];
      contactsById = new Map(rows.map((c) => [c.id, c]));
    } catch (e) {
      // TODO(schema): HL contacts table or custom_fields column may not exist
      // in the cache. Surface the gap rather than crashing the page.
      console.error("[pipelines] contacts enrichment failed:", e);
      contactsFallback = true;
    }
  }

  const now = Date.now();

  return pipelines
    .map((p) => {
      const pipelineStages = stages
        .filter((s) => s.pipeline_id === p.id)
        .sort((a, b) => a.position - b.position);

      const pipelineOpps = opps.filter((o) => o.pipeline_id === p.id);

      const stageData = pipelineStages.map((s) => {
        const stageOpps = pipelineOpps.filter(
          (o) => o.pipeline_stage_id === s.id,
        );
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

      // Top 5 most-recently-updated open opps, enriched.
      const recentOpps: EnrichedOpportunity[] = [...pipelineOpps]
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        .slice(0, 5)
        .map((o) => {
          const contact = o.contact_id
            ? contactsById.get(o.contact_id)
            : undefined;
          const fallbackName = contactsFallback
            ? `contact ${o.contact_id?.slice(0, 8) ?? "—"} (name unavailable)`
            : o.contact_id
              ? `contact ${o.contact_id.slice(0, 8)}`
              : "—";
          return {
            id: o.id,
            pipeline_id: o.pipeline_id,
            pipeline_stage_id: o.pipeline_stage_id,
            contact_id: o.contact_id ?? null,
            contact_name: contact ? contactDisplayName(contact) : fallbackName,
            lp_prospect_id: contact
              ? extractLpProspectId(contact.custom_fields)
              : null,
            monetary_value: o.monetary_value ?? null,
            updated_at: o.updated_at,
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
        recentOpps,
        contactsFallback,
      };
    })
    .sort((a, b) => b.count - a.count);
}
