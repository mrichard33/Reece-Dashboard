"use server";

import { lpServer } from "@/lib/supabase/lp";
import type { FbSubtopic } from "@/lib/supabase/types";

const SUBTOPIC_COLUMNS =
  "id, subtopic, pillar, buyer_stage, source, answers_question, source_evidence, status, last_used_at, times_used, created_at";

/**
 * Fetch one subtopic's full detail. Used by the planned-slot drawer (PlanReview)
 * to show what a planned day will actually cover, before it is generated.
 */
export async function getSubtopicDetail(id: string): Promise<FbSubtopic | null> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_subtopics")
    .select(SUBTOPIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[content] getSubtopicDetail:", error.message);
    return null;
  }
  return (data as unknown as FbSubtopic) ?? null;
}
