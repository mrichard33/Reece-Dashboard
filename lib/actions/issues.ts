"use server";

import { revalidatePath } from "next/cache";
import { lpServer } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

export type CreateIssueInput = {
  description: string;
  severity?: ClaudeKnownIssue["severity"];
  category?: string | null;
  workflow_name?: string | null;
  impact?: string | null;
};

export type CreateIssueResult = { ok: boolean; error?: string };

/**
 * File a new operational issue from the Issues panel. Writes a row to
 * `claude_known_issues` (status "open", reported now). Operators only.
 */
export async function createIssue(
  input: CreateIssueInput,
): Promise<CreateIssueResult> {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (ctx.role !== "operator") return { ok: false, error: "Operators only." };

  const description = input.description?.trim();
  if (!description) return { ok: false, error: "Description is required." };

  const severity = input.severity ?? null;
  const category = input.category?.trim() || null;
  const workflow_name = input.workflow_name?.trim() || null;
  const impact = input.impact?.trim() || null;

  const sb = await lpServer();
  const { error } = await sb.from("claude_known_issues").insert({
    description,
    severity,
    category,
    workflow_name,
    impact,
    status: "open",
    reported_date: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/issues");
  return { ok: true };
}
